import {redirect} from 'next/navigation'

// Keep old bookmarks working without a separate review workflow.
export default function PhaseMilestoneReviewPage(){redirect('/dashboard/approval')}
