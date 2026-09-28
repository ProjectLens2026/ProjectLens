// Reopen self-service only after the company pilot and billing review.
// These switches do not change Supabase Auth policy or existing subscriptions.
export const SELF_SERVICE_SIGNUP_ENABLED = false
export const SELF_SERVICE_CHECKOUT_ENABLED = false
export const PILOT_CONTACT_HREF = 'mailto:sales@control-lens.com?subject=CPMreview%20company%20pilot&body=Company%3A%20%0ARole%3A%20%0ANumber%20of%20projects%3A%20%0ASchedule%20format%20(P6%20XER%20or%20Microsoft%20Project%20XML)%3A%20%0AWhat%20would%20you%20like%20to%20evaluate%3F%20'
