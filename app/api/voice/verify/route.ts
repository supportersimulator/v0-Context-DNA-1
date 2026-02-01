/**
 * Voice Verification Proxy
 *
 * Proxies voice verification requests to the Django backend.
 * Handles multipart form data with audio files.
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = 'https://api.ersimulator.com'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const userEmail = formData.get('user_email')

    console.log('[Proxy] Verifying voice for:', userEmail)

    // Forward the form data to the backend
    const response = await fetch(
      `${BACKEND_URL}/api/contextdna/voice/verify/`,
      {
        method: 'POST',
        body: formData,
      }
    )

    const data = await response.json()
    console.log('[Proxy] Verification response:', data)

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('[Proxy] Verification error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
