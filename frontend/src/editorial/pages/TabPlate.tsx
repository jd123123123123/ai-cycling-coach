import { useParams } from 'react-router-dom'
import EditorialRoot from '../EditorialRoot'
import NotInThisSystem from './NotInThisSystem'

/** The four undesigned tabs (train/recovery/history/social) land here. */
export default function TabPlate() {
  const { tab } = useParams()
  return (
    <EditorialRoot>
      <NotInThisSystem tab={(tab ?? '').toUpperCase()} />
    </EditorialRoot>
  )
}
