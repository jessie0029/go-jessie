# GO JESSIE! — setup guide

This gets your to-do app online, installed on your Android phone, synced with your browser, and sending reminders. Everything is free and no card is needed. Plan about 45 minutes for all three parts. You can stop after Part 1 and use the app on one device right away.

---

## Part 1 · Put the app online (GitHub Pages, ~10 min)

1. On github.com, click **+ → New repository**.
   - Name: `go-jessie`
   - Visibility: **Public** (free GitHub Pages needs this; your tasks are not in the repository, only the app's code)
   - Click **Create repository**.
2. On the new repository page, click **uploading an existing file**. Unzip `go-jessie.zip` on your computer and drag **everything inside the folder** into the upload area, then click **Commit changes**.
   - The folder contains a hidden folder called `.github` (it runs your reminders). On a Mac, Finder hides it: in the unzipped folder press **Cmd + Shift + .** to show it, then drag it in too.
   - If it still doesn't upload, skip it for now. Part 3 explains a workaround.
3. Go to **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After about a minute, the page shows your app's address, for example `https://YOUR-GITHUB-NAME.github.io/go-jessie/`. Open it in your browser.
5. **Install on your phone:** open the same address in **Chrome** on your Android phone, tap the **⋮** menu → **Install app** (or **Add to Home screen**). GO JESSIE! now has its own icon and works offline.

At this point the app works, but each device keeps its own list. Parts 2 and 3 add sync and reminders.

---

## Part 2 · Turn on sync and encryption (Firebase, ~20 min)

**2.1 Create the project**
1. Go to console.firebase.google.com and sign in with your Google account.
2. **Create a project** → name it `go-jessie` → turn **off** Google Analytics → **Create**. You stay on the free "Spark" plan; never click "Upgrade".

**2.2 Email sign-in**
1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → turn on **both** switches (Email/Password *and* Email link (passwordless sign-in)) → **Save**.
3. **Settings** tab → **Authorized domains** → **Add domain** → type `YOUR-GITHUB-NAME.github.io` → **Add**.

**2.3 Database**
1. Left menu: **Build → Firestore Database → Create database**.
2. Location: **europe-west3 (Frankfurt)** → Next → **Start in production mode** → **Create**.
3. Open the **Rules** tab. Delete what's there and paste the contents of the file `firestore.rules` from the zip. Replace `REPLACE_WITH_YOUR_EMAIL` with the email you'll sign in with. Click **Publish**.
   This lock means only you, signed in with that email, can read or write your data.

**2.4 Connect the app**
1. Click the **gear icon → Project settings**. Under "Your apps", click the **</>** (Web) icon. Nickname: `go-jessie`. Don't tick Firebase Hosting. **Register app**.
2. You'll see a block starting with `const firebaseConfig = {`. Copy the part from `{` to `}`.
3. In GitHub, open your repository → click `config.js` → the **pencil icon** (Edit).
4. Replace `export const FIREBASE_CONFIG = null;` with `export const FIREBASE_CONFIG = ` followed by what you copied and a `;` at the end. (The example in the file shows the shape.)
5. Back in Firebase: **Project settings → Cloud Messaging** tab → scroll to **Web Push certificates** → **Generate key pair**. Copy the long key and paste it between the quotes of `VAPID_KEY = ""` in `config.js`.
6. Click **Commit changes** in GitHub. Wait about a minute.

**2.5 First sign-in**
1. Open the app (close and reopen it on the phone so it picks up the change) → **Settings → Sync and encryption**.
2. Enter your email → **Email me a sign-in link**. Open the email **on the same device** and tap the link. (It comes from `noreply@go-jessie….firebaseapp.com` and sometimes lands in spam.) If the link opens in Chrome instead of the installed app, that's fine: sign in there once, then open the installed app.
3. Choose a **passphrase**. This encrypts your tasks before they leave the device.
4. The app shows a **recovery code**. Write it down or save it in your password manager. If you forget your passphrase, this code is the only way back in. Nobody else can recover your data.
5. Tap **Turn on notifications** in Settings and allow them.
6. On your other device (laptop browser or phone), sign in the same way and enter the same passphrase. Tasks you made before signing in are uploaded automatically.

---

## Part 3 · Phone reminders when the app is closed (GitHub, ~10 min)

1. Firebase: **Project settings → Service accounts → Generate new private key → Generate key**. A `.json` file downloads. Treat it like a password.
2. GitHub, your repository: **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: open the downloaded `.json` file in a text editor, copy **all** of it, paste it here.
   - **Add secret**. Then delete the downloaded file from your computer.
3. Open the **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.
4. Click **Phone reminders** → **Run workflow** → keep "Send a test notification now" ticked → **Run workflow**. Within a minute or two your phone should show "GO JESSIE! test".

From now on GitHub checks every hour. At your morning hour (8:00 by default; change it in the app's Settings) you get:
- a **morning summary** of today's tasks and deadlines within 7 days,
- **countdown alerts** 7, 3 and 1 days before each absolute deadline (adjustable),
- an **overdue nudge** for anything past its "do it by" date.

GitHub sometimes runs late, so a reminder can arrive 10–30 minutes after the hour.

**If the `.github` folder didn't upload in Part 1:** in the Actions tab click **set up a workflow yourself**, name the file `reminders.yml`, paste the contents of `.github/workflows/reminders.yml` from the zip, and commit.

---

## Good to know

- **What the server can see:** dates, done/open status and point numbers. Task names, notes, tags and rewards are encrypted, and only your devices hold the key.
- **Backups:** Settings → Download backup saves everything as a file (readable, so keep it private).
- **Updating the app:** edit files on GitHub (for example `quotes.js` to change your quotes). Your phone picks up the change the next time you open the app with internet.
- **Points (defaults, editable in Settings):** done +10 · on time +5 · high priority +5 · daily streak bonus +5 from day 3 · snooze −5 · missed absolute deadline −10. "On time" means done by the "do it by" date and before the absolute deadline. Unticking a task takes back exactly what it earned.
- **Ranks:** Novice 0 → Student 100 → Répétiteur 250 → Section Player 500 → Principal 1,000 → Concertmaster 2,000 → Soloist 3,500 → Virtuoso 5,500 → Maestro 8,000 (lifetime score; redeeming rewards doesn't lower your rank).
