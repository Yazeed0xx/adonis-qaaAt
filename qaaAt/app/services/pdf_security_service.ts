import { execFile } from 'node:child_process'
import { open } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { MultipartFile } from '@adonisjs/bodyparser'
import env from '#start/env'
import InvalidInputException from '#exceptions/invalid_input_exception'
import ServiceUnavailableException from '#exceptions/service_unavailable_exception'

const execFileAsync = promisify(execFile)
const PDF_HEADER = Buffer.from('%PDF-')
const PDF_EOF = Buffer.from('%%EOF')
const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024

export type MalwareScanner = (filePath: string) => Promise<void>

async function scanWithClamAv(filePath: string) {
  const command = env.get('MALWARE_SCANNER_COMMAND', 'clamdscan')

  try {
    await execFileAsync(command, ['--no-summary', filePath], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    })
  } catch (error) {
    const exitCode =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

    if (exitCode === 1) {
      throw new InvalidInputException(
        'The registration document failed malware validation',
        'PDF_MALWARE_DETECTED'
      )
    }

    throw new ServiceUnavailableException(
      'Registration document scanning is temporarily unavailable',
      'PDF_MALWARE_SCAN_UNAVAILABLE'
    )
  }
}

export class PdfSecurityService {
  constructor(private readonly malwareScanner: MalwareScanner = scanWithClamAv) {}

  async validateAndScan(file: MultipartFile) {
    if (!file.tmpPath) {
      throw new InvalidInputException('The PDF upload could not be processed', 'PDF_UPLOAD_INVALID')
    }

    if (file.size <= 0 || file.size > MAX_PDF_SIZE_BYTES) {
      throw new InvalidInputException('The PDF must not exceed 10 MB', 'PDF_SIZE_INVALID')
    }

    if (file.type !== 'application' || file.subtype !== 'pdf') {
      throw new InvalidInputException(
        'The registration document must have the application/pdf MIME type',
        'PDF_MIME_INVALID'
      )
    }

    const fileHandle = await open(file.tmpPath, 'r')
    try {
      const stats = await fileHandle.stat()
      if (stats.size <= 0 || stats.size > MAX_PDF_SIZE_BYTES) {
        throw new InvalidInputException('The PDF must not exceed 10 MB', 'PDF_SIZE_INVALID')
      }

      const header = Buffer.alloc(PDF_HEADER.length)
      const headerRead = await fileHandle.read(header, 0, header.length, 0)
      if (headerRead.bytesRead !== PDF_HEADER.length || !header.equals(PDF_HEADER)) {
        throw new InvalidInputException(
          'The registration document does not contain a valid PDF signature',
          'PDF_SIGNATURE_INVALID'
        )
      }

      const tailLength = Math.min(2048, stats.size)
      const tail = Buffer.alloc(tailLength)
      const tailRead = await fileHandle.read(tail, 0, tailLength, stats.size - tailLength)
      if (!tail.subarray(0, tailRead.bytesRead).includes(PDF_EOF)) {
        throw new InvalidInputException(
          'The registration document is not a complete PDF file',
          'PDF_STRUCTURE_INVALID'
        )
      }
    } finally {
      await fileHandle.close()
    }

    await this.malwareScanner(file.tmpPath)
  }
}

export default new PdfSecurityService()
