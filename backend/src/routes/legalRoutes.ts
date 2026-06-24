import { Router } from 'express'
import { currentLegalTermsVersion, currentPrivacyPolicyVersion } from '../config/legal.js'
import { requireAuth } from '../middleware/auth.js'
import { acceptCurrentLegalDocuments } from '../services/legalService.js'

export const legalRoutes = Router()

legalRoutes.get('/versions', (_request, response) => {
  return response.json({
    legalTermsVersion: currentLegalTermsVersion,
    privacyPolicyVersion: currentPrivacyPolicyVersion,
  })
})

legalRoutes.post('/accept', requireAuth, async (request, response) => {
  try {
    const userId = request.auth?.sub
    if (!userId) {
      return response.status(401).json({ message: 'Não autenticado' })
    }

    const result = await acceptCurrentLegalDocuments(userId)
    return response.json(result)
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Falha ao registrar aceite dos termos' })
  }
})
