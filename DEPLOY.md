# ProjectLens — Deployment Guide

## What this is
A full Next.js web application for ProjectLens — construction operational visibility platform.
Upload a schedule → get an AI-powered operational analysis → share with your team.

---

## STEP 1: Install tools on your computer (one time only)

### Install Node.js
Download from: https://nodejs.org (choose "LTS" version)
This also installs `npm` automatically.

### Install Git
Download from: https://git-scm.com

---

## STEP 2: Set up your project locally

Open Terminal (Mac) or Command Prompt (Windows), then:

```bash
# Go to the projectlens folder
cd projectlens

# Install all dependencies
npm install

# Create your environment file
cp .env.example .env.local
```

Now open `.env.local` in any text editor and add your Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

Get your API key at: https://console.anthropic.com

---

## STEP 3: Run locally to test

```bash
npm run dev
```

Open your browser to: **http://localhost:3000**

You should see the ProjectLens landing page. Click "Start Free" to test the full flow.

---

## STEP 4: Deploy to Vercel (live on the internet — FREE)

### Create accounts (free):
- https://github.com (create account)
- https://vercel.com (sign in with GitHub)

### Push your code to GitHub:
```bash
git init
git add .
git commit -m "ProjectLens v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/projectlens.git
git push -u origin main
```

### Deploy on Vercel:
1. Go to https://vercel.com/new
2. Click "Import" next to your `projectlens` repository
3. Click "Deploy" — Vercel detects Next.js automatically

### Add your API key to Vercel:
1. Go to your project in Vercel
2. Settings → Environment Variables
3. Add: `ANTHROPIC_API_KEY` = your key
4. Click "Redeploy"

Your app is now live at: **https://projectlens.vercel.app**

---

## STEP 5: Connect your domain (projectlens.app or .com or .org)

1. In Vercel: Settings → Domains → Add your domain
2. In your domain registrar (GoDaddy, Namecheap, etc.): 
   - Add a CNAME record pointing to `cname.vercel-dns.com`
3. Wait 10-30 minutes for DNS to propagate

---

## File structure explained

```
projectlens/
├── src/app/
│   ├── page.tsx              ← Landing/marketing page
│   ├── login/page.tsx        ← Login & signup
│   ├── dashboard/
│   │   ├── layout.tsx        ← Sidebar wrapper
│   │   ├── page.tsx          ← Main dashboard
│   │   ├── upload/page.tsx   ← Schedule upload (CORE FEATURE)
│   │   ├── lens/page.tsx     ← AI analysis results
│   │   ├── risks/page.tsx    ← Risk register
│   │   ├── schedule/page.tsx ← Schedule view
│   │   └── ...more pages
│   └── api/analyze/route.ts  ← AI analysis engine (Anthropic API)
├── src/components/
│   └── Sidebar.tsx           ← Navigation sidebar
├── .env.example              ← Environment variables template
└── package.json              ← Dependencies
```

---

## What the AI analysis does

When a user uploads a schedule file:
1. File is read (XER files are text-based and fully readable)
2. User fills in project context (phase, procurement issues, concerns)
3. Both are sent to Claude (Anthropic) with a construction expert prompt
4. Claude responds like an experienced project controls advisor
5. Analysis is displayed with typewriter effect
6. User can generate owner email from the analysis

---

## Next features to build (Phase 2)

- [ ] Supabase database integration (save projects between sessions)
- [ ] Real user authentication (NextAuth.js)
- [ ] PDF parsing for schedule PDFs
- [ ] Risk register with persistent storage
- [ ] Weekly email report generation
- [ ] Team collaboration (invite owner rep, scheduler)
- [ ] ProjectLens Plus tier with deeper P6 analysis

---

## Support
Built by ProjectLens. Questions? hello@projectlens.app
