import { redirect } from 'next/navigation'

/**
 * Boot Config is now part of the unified Account page.
 * This route redirects old links to /account.
 */
export default function BootConfigRedirect() {
    redirect('/account')
}
