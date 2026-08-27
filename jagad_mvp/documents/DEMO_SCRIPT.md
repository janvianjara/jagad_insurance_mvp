# Jagad Insurance MVP — Demo script

The golden path of plan §11.2, click by click, on the story cast. Written to be
read aloud while somebody drives.

**What this document promises.** Every section marked *live* below has been
walked in a test that runs on every build, so it works or the build is red.
Every section marked **pending** names the playbook step that will make it live
and says, in one line, what is missing. Nothing here is aspirational: if it is
written as a click, it is a click that works today.

**Before you start.**

- `npm run dev`, then open the app. There is no login in M0 — sign-in is the
  account switcher in the rail footer, labelled **Signed in as**.
- The whole build reads a fixed instant, 26 August 2026, 09:30 UTC. Every
  countdown, expiry and renewal date in this script means what it says relative
  to that, and will still mean it next month.
- The inquiry screens carry a **Demo clock** control (dev builds only). It moves
  the *reading*, never a record: pressing `+1 hr` makes every countdown, stripe
  and guarded action on the screen behave exactly as it would have an hour later.
  This is how a turnaround lapse is shown without waiting an hour. `Reset clock`
  puts it back, so the demo can be run twice.

**The cast.**

| Person | Role | Signed in as |
|---|---|---|
| Vivek Jagad | Admin, whole business | the configuration half of the demo |
| Nikunj Shah | Sales, team pipeline | the inquiry desk |
| Kiran Solanki | Agent, own customers only | the narrow view — proof the rail is permissions |
| Priya Desai | Back-office, assigned queues | KYC, consent, policy entry |
| Meera Joshi | Sub-agent, own leads | capture in the field |
| Amit Rana / Sneha Patel | Claims / Renewals | named for completeness; their modules are P2 |

---

## 1. Sign in, and the briefing — *live*

1. Open `/`. You land on `/assistant`. The Assistant opens with a **counted
   briefing** — "N open inquiries across the team", and what is still unassigned
   or past its turnaround — not a greeting and not a prompt box.
2. Below it are the **suggestion chips**. There is no free-text box anywhere: in
   M0 the Assistant answers from a fixed set of questions over the queue you are
   allowed to see, and says so.
3. Use **Signed in as** in the rail footer to switch from **Vivek Jagad** to
   **Kiran Solanki**. Two things change at once, and both are the point:
   - the briefing changes from "open inquiries across the team" to "open leads"
     in his own book;
   - the rail loses the whole **Configuration** section, and what he keeps is
     relabelled to say whose it is: the section is **My book**, the items are
     **My leads**, **My customers**, **My policies**. Commission is narrowed to
     his own book rather than removed. The rail is rendered by the permission
     evaluator, not by a role name in a switch statement.
4. Switch again to **Meera Joshi**, the sub-agent. She has no Assistant at all
   and lands on her leads instead.
5. Switch back to **Vivek Jagad**.
6. Anywhere in the product, press **Cmd-K** (or Ctrl-K). The Assistant opens in
   the right-hand drawer carrying the route you were on as context. Escape closes it.

> Talk track: "The Assistant reads a projection of your queue and nothing else.
> It never sees an Aadhaar number, a diagnosis or a document's text — that is a
> boundary the build enforces with a test, not a policy document."

---

## 2. Configuration — *live*

The claim is that the system is configuration, not code. This is the section that
proves it. Signed in as **Vivek Jagad** throughout.

### 2a. A new insurer partnership (canvas 6.1)

1. Rail → **Companies** (`/config/companies`). Eight insurers are on file:
   HDFC Ergo, Niva Bupa, Bajaj Allianz, ICICI Lombard,
   Tata AIG, IFFCO Tokio, Royal Sundaram, LIC.
2. **New company**. Registered name *Star Health and Allied Insurance*, short
   name *Star Health*, claims desk email, tick **Health**. Create.
   - Now tick **Life** as well on the row you just made, and read the refusal: a
     life company and a general company are separately licensed, so they are two
     rows here, never one row with a flag. Untick it.
3. Open the new row. Add a contact — *Meghna Rao*, *Health claims desk*, category
   **Health**. A contact is filed under the category whose desk will need it, so
   the claims screen can find the right person later without anybody choosing.
4. Rail → **Products** (`/config/products`). **New product**: company *Star
   Health*, name *Family Health Optima*, code *SH-FHO*, inquiry category
   **Health**. Create.
5. Rail → **Agencies** (`/config/agencies`). Open **Jagad Insurance Brokers -
   General**, tick the new *Star Health* company, **Save agency**, confirm.
   Scroll to the policy scope: the new insurer's catalogue is now offered.
   The partnership is placeable.

### 2b. A new placement code (canvas 6.3)

1. Still on `/config/agencies`, **New agency**. Name *Jagad Insurance (Tata AIG)*,
   type **Individual**, tick *Tata AIG General Insurance*.
   - The hint under the name reads *It will be issued the code JAG-IND-TA*. The
     code is generated, never typed — it is what every policy written under this
     appointment will carry.
   - Tick a second company and read the refusal: an Individual appointment locks
     to exactly one company, and the refusal names the two ways out (a second
     agency code, or the Broker type). Untick, then Create.
2. Open the agency you just made. Its policy scope is empty: an appointment is
   not yet a permission to place anything.
3. Tick **MediCare Premier (TA-MCP)** and type **17.5** into *Commission on
   TA-MCP*. **Save policy scope** — the gate previews "Placeable from now on" —
   confirm.
   - The percentage is a percentage. Nothing on this screen multiplies it by
     anything, and a rate nobody has agreed reads *Not set*, never zero.

### 2c. A new agent, and the team he may build (canvas 6.4)

1. Rail → **Agents** (`/config/agents`). **New agent**: name *Bhavesh Modi*,
   agency *Jagad Insurance Brokers - General*, own percentage **55**. Create.
2. Open his row. Turn on **May recruit sub-agents**, clear **No cap set**, and set
   the **Sub-agent cap** to **30**. Turn on **May post updates directly**. Save,
   confirm.
3. **New agent** again: *Dhruv Shah*, same agency, **Reports to** *Bhavesh Modi*
   — he is on that list only because of the grant you just made — own percentage
   **40**. Create.
   - Refused, naming the cap: 40% is above the 30% ceiling. No row was created.
4. Change it to **25** and Create. Reopen Bhavesh: *Dhruv Shah* is now on his team.

### 2d. The rest of configuration, worth showing briefly

- **Users** (`/config/users`) — assign a different permission template to someone
  and watch the nav they see change in the preview. Templates are cloned and
  edited; a starter template is never mutated.
- **Masters** (`/config/masters`) — try to delete a master value that is in use.
  It is refused, and deactivation is offered instead. Values are versioned; a
  rename keeps the stored key, so old records still resolve.
- **Benefits** (`/config/benefits`) and the benefit map on a product — take a
  benefit off a policy's sheet and see the change previewed before it is written.

> Two configuration rows are deliberately not in this demo: the **form schema
> builder** (`/config/forms`) and **automation recipes** (`/config/automation`)
> are both P1. The engine underneath both is here — a record keeps the schema
> version it was written on, and the turnaround allowance is read from the
> inquiry category rather than from code — but the screens an admin edits them on
> arrive in P1.

---

## 3. An inquiry, its turnaround, and its escalation — *live*

Switch to **Nikunj Shah** (sales) or stay as Vivek; both can act here.

### 3a. Nothing is lost (canvas 1.5)

1. Rail → **Inquiries** (`/inquiries`). The banner at the top reads *1 inquiry is
   unrouted* and says it is held here and alerted rather than dropped.
2. Open **INQ-1041**, *Ketan Zaveri* — he asked about cover for a pet, and no
   category matches. The record says *Unrouted — the admin has been alerted*.
   The system never silently drops a lead it cannot classify.

### 3b. Routing, and the clock starting (canvas 1.1)

1. Open **INQ-1044**, *Urvashi Naik* — arrived from the website eight minutes ago,
   Health, status **New**.
2. **Run routing** → the gate previews who it will go to and that they will be
   notified → **Route and notify**.
3. It is now **Assigned** to *Kiran Solanki*, he has been notified, and the
   turnaround clock is running. The record panel says the allowance is
   *60 minutes, from the Health category in configuration* — the number came from
   §2's configuration, not from this screen.

### 3c. The turnaround lapsing, live (canvas 1.3)

This is the moment the Demo clock exists for.

1. Open **INQ-1045**, *Tejas Amin* — assigned 35 minutes ago against a 60 minute
   allowance. The header clock reads **due in 25 minutes**.
2. *Auto-reassign to the next person* is on screen but disabled, with the
   machine's own sentence underneath explaining that the allowance has not run out.
3. Press **+1 hr** on the **Demo clock**. The control now reads *+60 min ahead*,
   the header clock flips to **breached by 35 minutes**, and the reassign action
   becomes available. Nothing about the record changed; the clock did.
4. **Auto-reassign to the next person** → **Reassign and notify**. It moves to the
   next person in the *same* category group — the group never widens — and both
   the old and the new holder are notified. Both holds are on the assignment trail.
5. Press **Reset clock** to put the demo back where it started.

*(INQ-1046, Rina Chokshi, is seeded already-breached if you would rather show the
lapsed state without moving the clock. INQ-1045 is the one to use when you want
the client to see it happen.)*

### 3d. Confirmation inside the allowance (canvas 1.2)

Reset the clock first. On **INQ-1045**, **Confirm and accept** → **Confirm**.
Status **Accepted**, the assignee owns it, and the clock stops — the header reads
*clock stopped* rather than a countdown.

### 3e. Escalation with the full history (canvas 1.4)

1. Open **INQ-1042**, *Sagar Bhavsar* — reassigned once already, second allowance
   spent.
2. **Escalate with the full history** → **Escalate**.
3. It goes to *Nikunj Shah*, named by the escalation recipe rather than by this
   screen, and the panel *Assignment history carried with this escalation* lists
   **both** previous holders. The manager receives the trail, not just the item.

### 3f. Capture in the field (canvas 1.6)

1. Switch to **Meera Joshi**, the sub-agent.
2. `/inquiries/new`. Type a name and a mobile. Nothing else. **Save inquiry**.
3. The inquiry exists on the platform's own numbering — the next number in the
   series, **INQ-1047** — it is linked to Meera, and it has already entered
   routing: a destination and a 60 minute allowance are resolved and waiting.

---

## 4. The Quotation Composer, revisions, and Won — **pending P-13**

> **Pending P-13.** The side-by-side benefit matrix, the ad-hoc benefit row, the
> revision loop with its compulsory reason, and converting a quotation to a Deal
> with its application number and line items. `/quotations` resolves to a stub
> naming the step until P-13 lands. Canvas rows 2.1 to 2.8 are marked `pending`
> against P-13 in `src/test/scenarios/registry.ts`.

---

## 5. KYC, consent and credentials — *live*

Switch to **Priya Desai** (back office).

### 5a. The desk half (canvas 3.1)

1. Rail → **Back office** → **KYC** (`/back-office/kyc`), or go straight to
   `/back-office/kyc?q=Patel`. The URL owns the search, so that address is the
   queue, reconstructible from the link alone.
2. The queue holds only files that still owe work — not one row on the page is a
   completed file.
3. Click **Rakesh Patel**. He opens at `/customers/cus-rakesh-patel?tab=kyc` —
   customer **CUS-0001**, KYC **part-filled**.
4. The checklist reads **2 of 4 on file** and comes from the *product's*
   configuration, not from this screen. **Complete KYC** is disabled, and the
   block is the machine's own sentence: *Still missing: Passport photograph,
   Address proof.*
5. Press **Record received** on *Passport photograph*. It reads **3 of 4 on file**.

### 5b. OCR never silent-commits

1. The panel **Extracted values — confirm each one** holds a PAN the extractor
   read but nobody has confirmed. The save is disabled and says so.
2. Press **Confirm** on the row. Now save is enabled.
3. Type a character into the field. The save disables again — a correction wants a
   second look — and the extractor's original read, *ABCPP1234K*, is still on
   screen beside your edit. An extracted value never quietly becomes a stored one.
4. Press **Save the confirmed values**.

> Note the Aadhaar on this file: **last four digits only**, everywhere in staff
> UI. The full number is not rendered anywhere in the product, and no form of it
> — masked included — is ever in the Assistant's context.

### 5c. The customer half, on their own phone (canvas 3.1)

1. Staff alone cannot finish this file: the address proof is the customer's to
   supply. That is exactly what the canvas row's "staff + consent link" means.
2. Open the consent link: `/consent/cns-8f31c6d2a47b9e05f1a2`. It renders with
   **no shell, no rail and no session** — it is registered outside the app layout
   so it cannot acquire one.
3. The page opens *Namaste Rakesh*. Walk its stages — **Address**, **Documents**,
   **Consent** — which are the stages an admin published, not stages this screen
   hard-coded. Tick the consent statement.
4. **Review and send** → **Yes, send them**.
5. *Thank you, Rakesh* — the file is complete. Consent is recorded, and the
   completion went through the machine on the consent route.

### 5d. Credentials fire on their own (canvas 3.2)

1. Back on the staff side, **Complete KYC** → **Complete and issue credentials**.
2. There is no credentials button anywhere on the screen, before or after. The
   recipe is on the same machine edge as the completion, so it cannot be skipped.
3. The receipt reads *username rakesh.patel sent on whatsapp*. The message log
   records what went out and to whom, and there is no password anywhere in it.

---

## 6. Policy entry, the PDF, and POLICY LIVE — **pending P-15**

> **Pending P-15.** Entering the policy from the deal's line items, the half-done
> draft landing in the completion queue with its missing fields named
> (**POL-DRAFT-0219** is the seeded example), uploading the insurer's PDF, the
> OCR review that stores both the system number and the insurer's number, and the
> transition to **POLICY LIVE**. Canvas rows 3.6 and 3.7 are marked `pending`
> against P-15 in `src/test/scenarios/registry.ts`.

---

## 7. The commission chain — **pending P-16**

> **Pending P-16.** The three-level chain — payer, then agency percentage, then
> agent percentage, then the sub-agent share carved from the agent's cut inside
> the cap you set in §2c — producing ledger rows at every level, and the
> read-only `/commission` view that expands the chain per policy. The cap rule
> itself is already enforced, in configuration, in §2c above.

---

## What this demo does not show

Straight from plan §11.2, said out loud so nobody has to ask:

- **Claims** (canvas flow 4) and **renewals including bulk notice ingest**
  (flow 5) are P2. Their records are seeded so the screens open onto something
  real when they are built, but there is no claims or renewals screen today.
- **Endorsements and cancellation** (flow 7) are P2.
- **Collections and cheque bounce** (canvas 3.3 to 3.5) are P1.
- There is no premium rating engine, and there never will be. Every amount in
  this product is typed by a person or read off an insurer's document. The only
  arithmetic anywhere is Net = the sum of typed components, and Final = Net plus
  the typed GST.

## Where the claims in this document are checked

- `src/test/scenarios/registry.ts` — all 48 canvas rows, each with its phase and
  its coverage state. `registry.test.ts` checks the rows against the canvas
  itself and checks that every test it names exists, by name.
- `src/test/scenarios/walkthrough.test.tsx` — the Demo clock lapsing a live
  turnaround, and the rail walk in §1 to §5.
- `src/test/scenarios/admin-configuration.test.tsx` — §2a, §2b and §2c, end to end.
- `src/features/inquiries/inquiry-scenarios.test.tsx` — §3, row by row.
- `src/features/kyc/kyc-scenarios.test.tsx` — §5, row by row.
