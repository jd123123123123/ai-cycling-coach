"""Owned, date-specific workout export and terrain placement. No cloud push."""
import hashlib
import json
from dataclasses import asdict
from datetime import date, timedelta
from typing import Annotated, Literal
from xml.sax.saxutils import escape
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, model_validator, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.models.athlete_profile import AthleteProfile
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.services.athlete_time import today_local, set_athlete_tz_from_profile
from app.services.outdoor_workout import expand_intervals, place_workout, WorkoutUnavailable
from app.services.rehearsal.route_source import route_from_gpx, route_from_activity, RouteUnusable
from app.services.route_library import is_virtual_title
from app.services.workout_export import to_fit, to_zwo, to_erg, to_mrc

router = APIRouter(prefix='/outdoor', tags=['outdoor'])
UserDep = Annotated[User, Depends(get_current_active_user)]
DbDep = Annotated[AsyncSession, Depends(get_db_for_user)]

class RouteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    date: date
    revision: str | None = Field(default=None, min_length=64, max_length=64)
    activity_id: int | None = Field(default=None, gt=0)
    gpx: str | None = Field(default=None, max_length=5_000_000)
    name: str | None = Field(default=None, max_length=120)

    @model_validator(mode='after')
    def one_route(self):
        if (self.activity_id is None) == (self.gpx is None):
            raise ValueError('Choose exactly one route source')
        return self

def revision_for(day,blocks,ftp):
    return hashlib.sha256(json.dumps([str(day),ftp,[asdict(b) for b in blocks]],sort_keys=True).encode()).hexdigest()

def check_revision(expected,day,blocks,ftp):
    if expected is not None and expected != revision_for(day,blocks,ftp):
        raise HTTPException(409,'Deine Einheit wurde aktualisiert. Bitte wähle die Strecke erneut.')

async def selected_workout(day: date, db, user):
    from app.api.weeks import get_current_week
    profile = (await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user.id))).scalar_one_or_none()
    if profile is None:
        raise HTTPException(409, 'Bitte vervollständige zuerst dein Fahrerprofil.')
    set_athlete_tz_from_profile(profile)
    today = today_local()
    if day < today or day > today+timedelta(days=83):
        raise HTTPException(422, 'Wähle eine geplante Einheit ab heute, höchstens zwölf Wochen voraus.')
    offset = 0 if day < today+timedelta(days=7) else ((day-today).days+today.weekday())//7
    week = await get_current_week(language='simple',locale='de',week_offset=offset,db=db,current_user=user)
    workout = next((d for d in week.days if d.date == day),None)
    if workout is None or workout.category == 'rest' or workout.sport != 'cycling':
        raise HTTPException(404, 'Für diesen Tag ist keine Rad-Einheit geplant.')
    try:
        blocks = expand_intervals(workout.intervals, profile.ftp_watts)
    except WorkoutUnavailable as e:
        raise HTTPException(409,str(e)) from e
    return workout,blocks,profile

async def owned_route(payload, db, user):
    try:
        if payload.gpx is not None:
            raw=payload.gpx
            if '<!DOCTYPE' in raw.upper() or '<!ENTITY' in raw.upper():
                raise HTTPException(422,'Diese GPX-Datei enthält nicht unterstützte XML-Deklarationen.')
            try:
                root=ElementTree.fromstring(raw)
                if root.tag.split('}')[-1] != 'gpx' or not any(el.tag.split('}')[-1] in ('trkpt','rtept') for el in root.iter()):
                    raise ValueError('No route or track')
            except (ElementTree.ParseError,ValueError) as exc:
                raise HTTPException(422,'Die GPX-Datei muss einen Track oder eine Route enthalten, nicht nur Wegpunkte.') from exc
            return await run_in_threadpool(route_from_gpx,raw,name=payload.name or 'Deine GPX-Strecke')
        activity = (await db.execute(select(Activity).where(Activity.id==payload.activity_id,Activity.user_id==user.id))).scalar_one_or_none()
        if activity is None:
            raise HTTPException(404,'Diese Fahrt wurde nicht gefunden.')
        if activity.sport != 'cycling' or is_virtual_title(activity.title):
            raise HTTPException(422,'Bitte wähle eine draußen gefahrene Radstrecke.')
        stream=(await db.execute(select(ActivityStream).where(ActivityStream.activity_id==activity.id,ActivityStream.user_id==user.id))).scalar_one_or_none()
        if stream is None:
            raise HTTPException(409,'Zu dieser Fahrt fehlt der GPS-Track.')
        data=stream.streams or {}
        return route_from_activity(data.get('latitude') or [],data.get('longitude') or [],data.get('altitude') or [],name=activity.title)
    except (RouteUnusable,ValueError) as e:
        raise HTTPException(422,'Für diese Strecke fehlen gültige GPS- oder Höhendaten.') from e

@router.get('/workout')
async def get_workout(user: UserDep,db: DbDep,date: date):
    workout,blocks,profile=await selected_workout(date,db,user)
    return {'date':date,'revision':revision_for(date,blocks,profile.ftp_watts),'title':workout.title,'ftp':profile.ftp_watts,'category':workout.category,
            'blocks':[asdict(b) for b in blocks],'duration_s':sum(b.duration_s for b in blocks)}

@router.post('/fit')
async def route_fit(payload: RouteRequest,user: UserDep,db: DbDep):
    workout,blocks,profile=await selected_workout(payload.date,db,user)
    check_revision(payload.revision,payload.date,blocks,profile.ftp_watts)
    route=await owned_route(payload,db,user)
    try:
        result=await run_in_threadpool(place_workout,route,blocks,profile.ftp_watts,profile.weight_kg)
    except WorkoutUnavailable as e:
        raise HTTPException(409,str(e)) from e
    return {**result,'workout_title':workout.title,'date':payload.date}

@router.get('/export')
async def export_workout(user: UserDep,db: DbDep,date: date,
                         format: Literal['fit','zwo','erg','mrc']='fit',outdoor: bool=False,
                         revision: Annotated[str | None, Query(min_length=64,max_length=64)]=None):
    workout,blocks,profile=await selected_workout(date,db,user)
    check_revision(revision,date,blocks,profile.ftp_watts)
    args=dict(title=workout.title,description=f'RIDR · {date.isoformat()}',blocks=blocks,ftp=profile.ftp_watts)
    if format=='fit':
        content=to_fit(**args,lap_start=outdoor)
        mime='application/octet-stream'
    else:
        content={'zwo':to_zwo,'erg':to_erg,'mrc':to_mrc}[format](**args).encode('utf-8')
        mime='application/xml' if format=='zwo' else 'text/plain'
    return Response(content,media_type=mime,headers={'Content-Disposition':f'attachment; filename="ridr-{date}.{format}"','Cache-Control':'private, no-store'})

@router.get('/routes/{activity_id}/gpx')
async def download_route(activity_id: int,user: UserDep,db: DbDep):
    route=await owned_route(RouteRequest(date=today_local(),activity_id=activity_id),db,user)
    pts=''.join(f'<trkpt lat="{p.lat}" lon="{p.lng}"><ele>{p.elevation_m}</ele></trkpt>' for p in route.points)
    xml=f'<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="RIDR" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>{escape(route.name or "RIDR")}</name><trkseg>{pts}</trkseg></trk></gpx>'
    return Response(xml,media_type='application/gpx+xml',headers={'Content-Disposition':f'attachment; filename="ridr-route-{activity_id}.gpx"','Cache-Control':'private, no-store'})
