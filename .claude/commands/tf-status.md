---
description: Verify the real TestFlight delivery state of recent iOS builds (grouped + beta review submitted), not just "eas submit succeeded".
---

Run the App Store Connect status check and report the result plainly:

```
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
node scripts/asc-tf-status.cjs
```

Then, for the latest build, state clearly whether it is **fully delivered** (processing VALID + in at least one TestFlight group + beta review submitted with a real submittedDate) or **not** — and if not, what step is missing (usually: not added to the Early Birds group, or beta review not submitted). Never describe a build as "on TestFlight" unless this check confirms it.
