import { test } from '@japa/runner'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MultipartFile } from '@adonisjs/bodyparser'
import { PdfSecurityService } from '#services/pdf_security_service'
import InvalidInputException from '#exceptions/invalid_input_exception'

async function createUpload(
  contents: Buffer,
  overrides: Partial<Pick<MultipartFile, 'size' | 'type' | 'subtype'>> = {}
) {
  const directory = await mkdtemp(join(tmpdir(), 'qaaat-pdf-test-'))
  const tmpPath = join(directory, 'registration.pdf')
  await writeFile(tmpPath, contents)

  return {
    file: {
      tmpPath,
      size: contents.length,
      type: 'application',
      subtype: 'pdf',
      ...overrides,
    } as MultipartFile,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}

async function assertUploadRejected(
  service: PdfSecurityService,
  file: MultipartFile,
  expectedCode: string
) {
  await assert.rejects(
    () => service.validateAndScan(file),
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === expectedCode
  )
}

test.group('PDF security service', () => {
  test('accepts a structurally valid PDF only after malware scanning', async () => {
    const upload = await createUpload(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'))
    const scannedPaths: string[] = []
    const service = new PdfSecurityService(async (path) => {
      scannedPaths.push(path)
    })

    try {
      await service.validateAndScan(upload.file)
      assert.deepEqual(scannedPaths, [upload.file.tmpPath])
    } finally {
      await upload.cleanup()
    }
  })

  test('rejects a valid PDF when the malware scanner detects a threat', async () => {
    const upload = await createUpload(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'))
    const service = new PdfSecurityService(async () => {
      throw new InvalidInputException(
        'The registration document failed malware validation',
        'PDF_MALWARE_DETECTED'
      )
    })

    try {
      await assertUploadRejected(service, upload.file, 'PDF_MALWARE_DETECTED')
    } finally {
      await upload.cleanup()
    }
  })

  test('rejects a PDF with a forged MIME type before scanning', async () => {
    const upload = await createUpload(Buffer.from('%PDF-1.7\n%%EOF\n'), {
      type: 'text',
      subtype: 'plain',
    })
    let scanned = false
    const service = new PdfSecurityService(async () => {
      scanned = true
    })

    try {
      await assertUploadRejected(service, upload.file, 'PDF_MIME_INVALID')
      assert.equal(scanned, false)
    } finally {
      await upload.cleanup()
    }
  })

  test('rejects files without the PDF magic signature', async () => {
    const upload = await createUpload(Buffer.from('not-a-pdf\n%%EOF\n'))
    const service = new PdfSecurityService(async () => {})

    try {
      await assertUploadRejected(service, upload.file, 'PDF_SIGNATURE_INVALID')
    } finally {
      await upload.cleanup()
    }
  })

  test('rejects truncated PDFs without an EOF marker', async () => {
    const upload = await createUpload(Buffer.from('%PDF-1.7\ntruncated'))
    const service = new PdfSecurityService(async () => {})

    try {
      await assertUploadRejected(service, upload.file, 'PDF_STRUCTURE_INVALID')
    } finally {
      await upload.cleanup()
    }
  })

  test('rejects PDFs larger than 10 MB', async () => {
    const upload = await createUpload(Buffer.from('%PDF-1.7\n%%EOF\n'), {
      size: 10 * 1024 * 1024 + 1,
    })
    const service = new PdfSecurityService(async () => {})

    try {
      await assertUploadRejected(service, upload.file, 'PDF_SIZE_INVALID')
    } finally {
      await upload.cleanup()
    }
  })
})
