import type Company from '#models/company'
import type User from '#models/user'

export interface DemoScenarioContext {
  admin?: User
  users: {
    mohammed?: User
    sara?: User
    ahmed?: User
    fatima?: User
  }
  companies: {
    royal?: Company
    golden?: Company
    star?: Company
    quick?: Company
  }
}

export function createScenarioContext(): DemoScenarioContext {
  return {
    users: {},
    companies: {},
  }
}
