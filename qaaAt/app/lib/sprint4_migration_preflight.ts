export function assertSprint4RollbackSafe(spaceOnlyBookings: number) {
  if (spaceOnlyBookings > 0)
    throw new Error(
      `Sprint 4 rollback blocked: ${spaceOnlyBookings} Space-only Booking rows require Sprint 4 schema`
    )
}
