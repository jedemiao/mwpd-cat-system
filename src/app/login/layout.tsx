import { dressDayFor } from "@/lib/dressCode";

// This layout exists for one reason: to put the dress-code day on the login
// page. The page itself is a client component ("use client", for the form's
// state and the password toggle), so it cannot read the server clock — and
// resolving the day in the browser would hand the colour to whatever date the
// staff PC happens to think it is. A server layout wrapping a client page is
// the standard way round that.
//
// force-dynamic is required, not decorative. Without it Next renders this
// layout once at build time, `new Date()` is evaluated then, and every visitor
// afterwards sees the colour of whichever day the image happened to be built —
// the login page would be stuck on, say, Tuesday until the next deploy. The
// dashboard layout needs no such flag because reading the session already makes
// it dynamic. The cost here is negligible: the login page has nothing cacheable
// on it, and it renders before any database work.
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div data-day={dressDayFor()}>{children}</div>;
}
