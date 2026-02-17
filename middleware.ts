import { NextRequest, NextResponse } from 'next/server'

/**
 * CrabSpace — Rate Limiting Middleware
 *
 * Sliding window rate limiter for API routes.
 * Uses in-memory store (resets on deploy). For production at scale,
 * swap to Redis/Upstash. Fine for MVP launch.
 *
 * Limits:
 *   /api/work/*    → 30 requests per minute per IP
 *   /api/agents/*  → 30 requests per minute per IP
 *   /api/verify    → 60 requests per minute per IP (agents call this on boot)
 *   /api/isnad/*   → 60 requests per minute per IP
 *   Other /api/*   → 60 requests per minute per IP
 */

interface RateLimitEntry {
    count: number
    resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < CLEANUP_INTERVAL) return
    lastCleanup = now
    for (const [key, entry] of rateLimitStore) {
        if (now > entry.resetAt) {
            rateLimitStore.delete(key)
        }
    }
}

function getLimit(pathname: string): { max: number; windowMs: number } {
    if (pathname.startsWith('/api/work') || pathname.startsWith('/api/agents')) {
        return { max: 30, windowMs: 60_000 } // 30/min — write-heavy routes
    }
    return { max: 60, windowMs: 60_000 } // 60/min — read-heavy routes
}

function rateLimit(ip: string, pathname: string): { allowed: boolean; remaining: number; resetAt: number } {
    cleanup()

    const { max, windowMs } = getLimit(pathname)
    const key = `${ip}:${pathname.split('/').slice(0, 3).join('/')}` // Group by /api/<resource>
    const now = Date.now()
    const entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetAt) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: max - 1, resetAt: now + windowMs }
    }

    entry.count++
    if (entry.count > max) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    }

    return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt }
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Only rate-limit API routes
    if (!pathname.startsWith('/api')) {
        return NextResponse.next()
    }

    // Skip health/test endpoints
    if (pathname === '/api/test') {
        return NextResponse.next()
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown'

    const result = rateLimit(ip, pathname)

    if (!result.allowed) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Try again shortly.' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(result.resetAt),
                },
            }
        )
    }

    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
    response.headers.set('X-RateLimit-Reset', String(result.resetAt))
    return response
}

export const config = {
    matcher: '/api/:path*',
}
