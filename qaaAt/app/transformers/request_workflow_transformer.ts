const redactContact = (row: Record<string, unknown>) => {
  const safe = { ...row }
  delete safe.customer_email_snapshot
  return safe
}

export const RequestWorkflowTransformer = {
  companyInquiry(row: Record<string, unknown>) {
    return redactContact(row)
  },
  companyVisit(row: Record<string, unknown>) {
    return redactContact(row)
  },
}
