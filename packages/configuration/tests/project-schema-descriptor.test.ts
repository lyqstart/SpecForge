import { describe, expect, it } from 'vitest'

import { PROJECT_CONFIG_SCHEMA_DESCRIPTOR } from '../src/project-schema-descriptor'

describe('current project configuration schema descriptor', () => {
  it('binds the configuration owner to the only current project config path', () => {
    expect(PROJECT_CONFIG_SCHEMA_DESCRIPTOR).toMatchObject({
      id: 'project-config',
      owner: '@specforge/configuration/project',
      relativePath: '.specforge/config/project.json',
      format: 'json',
      required: true,
      currentSchemaId: '1.0',
      transitions: [],
    })
  })

  it('accepts records and rejects non-object current payloads', () => {
    expect(PROJECT_CONFIG_SCHEMA_DESCRIPTOR.validateCurrent({ schema_version: '1.0' })).toBe(true)
    expect(PROJECT_CONFIG_SCHEMA_DESCRIPTOR.validateCurrent([])).toBe(false)
    expect(PROJECT_CONFIG_SCHEMA_DESCRIPTOR.validateCurrent(null)).toBe(false)
  })
})
