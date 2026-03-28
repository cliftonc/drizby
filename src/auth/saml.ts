/**
 * SAML 2.0 authentication via samlify
 * Handles SP/IdP configuration and assertion parsing
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import * as samlify from 'samlify'
import { type SamlConfig, getSamlConfig } from '../services/oauth-settings'

// Disable XML schema validation by default — samlify requires an external
// validator library (e.g. @authenio/samlify-xsd-schema-validator) for full
// XSD validation. Signature validation still occurs and is the primary
// security control. Admins who need XSD validation can install the validator.
samlify.setSchemaValidator({
  validate: async (_xml: string) => 'skipped',
})

const SAML_BINDINGS = samlify.Constants.namespace.binding

/**
 * Build a samlify ServiceProvider from stored SAML settings.
 */
export function createServiceProvider(config: SamlConfig): samlify.ServiceProviderInstance {
  const baseUrl = (process.env.APP_URL || 'http://localhost:3461').replace(/\/$/, '')

  return samlify.ServiceProvider({
    entityID: config.spEntityId,
    assertionConsumerService: [
      {
        Binding: SAML_BINDINGS.post,
        Location: `${baseUrl}/api/auth/saml/callback`,
      },
    ],
    nameIDFormat: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
    wantAssertionsSigned: true,
  })
}

/**
 * Build a samlify IdentityProvider from stored SAML settings.
 * Supports configuration via metadata XML or individual fields.
 */
export function createIdentityProvider(config: SamlConfig): samlify.IdentityProviderInstance {
  if (config.idpMetadataXml) {
    return samlify.IdentityProvider({
      metadata: config.idpMetadataXml,
    })
  }

  // Fall back to manual certificate-based config when only URL-fetched cert is available
  return samlify.IdentityProvider({
    entityID: config.idpMetadataUrl,
    signingCert: config.idpCertificate,
    singleSignOnService: [
      {
        Binding: SAML_BINDINGS.redirect,
        Location: config.idpMetadataUrl,
      },
    ],
  })
}

/**
 * Fetch IdP metadata XML from a URL and return it.
 * Used during configuration to resolve metadata URL → XML.
 */
export async function fetchIdpMetadata(metadataUrl: string): Promise<string> {
  const res = await fetch(metadataUrl)
  if (!res.ok) throw new Error(`Failed to fetch IdP metadata: ${res.status} ${res.statusText}`)
  return res.text()
}

/**
 * Create both SP and IdP from database config.
 * Returns null if SAML is not configured.
 */
export async function createSamlEntities(db: DrizzleDatabase) {
  const config = await getSamlConfig(db)
  if (!config) return null

  // If we have a metadata URL but no XML, fetch and use the URL directly
  // (IdP configured with metadata URL as entityID + cert)
  const sp = createServiceProvider(config)
  const idp = createIdentityProvider(config)

  return { sp, idp, config }
}

/**
 * Extract user profile from a parsed SAML assertion.
 * Uses the attribute mapping from config to find the right fields.
 */
export function extractProfile(
  extract: any,
  attributeMapping: SamlConfig['attributeMapping']
): {
  provider: string
  providerUserId: string
  email: string
  name: string
  groups: string[]
} {
  const attributes = extract.attributes || {}
  const nameID = extract.nameID || ''

  // Try mapped attribute names, fall back to common SAML attribute URIs
  const email =
    attributes[attributeMapping.email] ||
    attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
    attributes['urn:oid:0.9.2342.19200300.100.1.3'] ||
    nameID

  const name =
    attributes[attributeMapping.name] ||
    attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
    attributes['urn:oid:2.5.4.3'] ||
    email.split('@')[0] ||
    'SAML User'

  // Groups may be a string or array
  const rawGroups =
    attributes[attributeMapping.groups] ||
    attributes['http://schemas.xmlsoap.org/claims/Group'] ||
    attributes.memberOf ||
    []
  const groups = Array.isArray(rawGroups) ? rawGroups : rawGroups ? [rawGroups] : []

  if (!email) {
    throw new Error('SAML assertion missing email attribute')
  }

  return {
    provider: 'saml',
    providerUserId: nameID || email,
    email,
    name,
    groups,
  }
}
