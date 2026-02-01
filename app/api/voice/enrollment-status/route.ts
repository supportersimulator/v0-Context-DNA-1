/**
 * Voice Enrollment Status Proxy
 *
 * Proxies voice enrollment status requests to the Django backend.
 * This helps bypass potential browser-specific issues with direct CORS requests.
 *
 * Usage: GET /api/voice/enrollment-status?user_email=xxx
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = 'https://api.ersimulator.com'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const userEmail = searchParams.get('user_email')

  if (!userEmail) {
    return NextResponse.json(
      { success: false, error: 'user_email parameter required' },
      { status: 400 }
    )
  }

  try {
    console.log('[Proxy] Checking enrollment for:', userEmail)

    const response = await fetch(
      `${BACKEND_URL}/api/contextdna/voice/enrollment-status/?user_email=${encodeURIComponent(userEmail)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    const data = await response.json()
    console.log('[Proxy] Backend response:', data)

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('[Proxy] Error:', error)
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
