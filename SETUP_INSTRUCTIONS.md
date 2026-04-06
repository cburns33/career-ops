# Career-Ops Setup Instructions for Chase Burns

## ✅ Completed Setup Steps

### 1. Repository Installation
- ✅ Cloned Career-Ops repository
- ✅ Installed Node.js dependencies
- ✅ Installed Playwright for PDF generation

### 2. Configuration Files Created
- ✅ Created `config/profile-chase.yml` with your personal details
- ✅ Created `portals-chase.yml` with digital marketing keywords
- ✅ Created `cv-template.md` for your resume content

### 3. Next Steps for You

#### A. Update Your Personal Information
Edit `config/profile-chase.yml`:
- Add your actual email and phone number
- Update your LinkedIn profile URL
- Add any portfolio URLs if you have them
- Fill in specific proof points with actual metrics

#### B. Convert Your Resumes
1. **Primary Resume**: Convert `Chase Burns Resume.pdf` to markdown format
2. **SEO Resume**: Convert `Chase Burns SEO Resume.pdf` to separate markdown file
3. Save both in the career-ops root directory as `cv.md` and `cv-seo.md`

#### C. Install Go (Optional - for Dashboard)
The dashboard requires Go 1.21+. If you want the TUI dashboard:
1. Download Go from https://go.dev/dl/
2. Install and add to PATH
3. Run: `cd career-ops/dashboard && go build -o career-dashboard .`

#### D. Test the System
1. Copy your customized files to replace the defaults:
   ```bash
   copy config\profile-chase.yml config\profile.yml
   copy portals-chase.yml portals.yml
   ```

2. Verify setup:
   ```bash
   node cv-sync-check.mjs
   node verify-pipeline.mjs
   ```

## 🎯 Customization Highlights

### Your Target Roles
- Digital Marketing Manager
- Paid Media Manager  
- Digital Marketing Strategist
- Marketing Operations Manager
- Growth Marketing Manager

### Location Preferences
- Remote preferred
- Hybrid in Austin only (near 2201 Tillery St, Austin, TX 78723)

### Salary Range
- Target: $100K-130K
- Minimum: $90K
- Contract: $50-65/hour equivalent

### Company Focus
- Austin-based tech companies for hybrid options
- Remote-first companies nationwide
- Tech, SaaS, and lead generation focus

## 📋 When You Get Claude Access

Once you have Claude Code access (either your brother's or your own subscription):

1. **Install Claude Code** and authenticate
2. **Open the career-ops directory** in Claude Code
3. **Test with a job posting** - paste any URL or job description
4. **Run your first evaluation** with `/career-ops`
5. **Explore the 14 skill modes** for different tasks

## 🚀 Quick Start Commands

When ready with Claude Code:
- `/career-ops` - Show all available commands
- Paste any job URL - Auto-evaluate + PDF + track
- `/career-ops scan` - Scan configured portals
- `/career-ops tracker` - View application status
- `/career-ops pdf` - Generate tailored resume

## 📞 Need Help?

- Resume conversion: I can help convert PDF to markdown
- Configuration tweaks: Adjust any settings as needed
- Dashboard setup: Install Go and build the TUI
- Testing: Verify all components work together

## 🔄 What's Working Now

Without Claude Code, you have:
- ✅ Complete configuration framework
- ✅ Personalized job filters and company lists
- ✅ Resume template ready for customization
- ✅ Structured approach to job applications
- ✅ Foundation for when you add Claude Code

The system is 80% ready - just needs your personal details and Claude access to activate the AI features!
