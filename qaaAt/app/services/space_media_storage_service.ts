import { randomUUID } from 'node:crypto'
import drive from '@adonisjs/drive/services/main'

export class SpaceMediaStorageService {
  private disk() {
    return drive.use('private')
  }

  key(companyId: number, spaceId: number, extension: string) {
    if (!Number.isSafeInteger(companyId) || !Number.isSafeInteger(spaceId))
      throw new Error('Invalid media scope')
    if (!['jpg', 'png', 'webp'].includes(extension)) throw new Error('Invalid media extension')
    return `spaces/${companyId}/${spaceId}/${randomUUID()}.${extension}`
  }

  put(key: string, bytes: Uint8Array) {
    return this.disk().put(key, bytes)
  }
  exists(key: string) {
    return this.disk().exists(key)
  }
  stream(key: string) {
    return this.disk().getStream(key)
  }
  delete(key: string) {
    return this.disk().delete(key)
  }
}
