# Intentset public site: information architecture and complete copy

**Version:** 0.1 concept/review package. Copy below is ready for editorial review. Public release needs approved license, confirmed repository/domain, and verified Markset links. The local wireframe links to draft documents; it does not claim an installable CLI exists.

## Information architecture

| Destination | Visitor need | Content / conversion |
|---|---|---|
| `/` | Understand Intentset | Problem, model, worked example, Markset, adoption, project status; read specification |
| `/start/` | Try the method on one behavior | Manual five-step guide, linked worked example; no invented install command |
| `/specifications/` | Evaluate technical rigor | Core, VSA, reference profile; scope/conformance distinction |
| `/markset/` | Understand the document layer | Format, metadata, publication, portability boundaries |
| `/roadmap/` | Understand maturity and contribute | Implemented package vs proposed tooling, milestones, contribution directions |
| `/about/` | Understand stewardship | Open-source intent, Coral Reef relationship, product independence |

Navigation: How it works (home anchor), Specifications, Markset, Roadmap. Primary CTA: **Read the draft specification**. Secondary CTA: **Explore an example**. Footer: Start, Specifications, Roadmap, Markset, About; “An open-source project in development from Coral Reef Ventures.” Repository CTA becomes “Contribute on GitHub” only when a real repository exists.

## Homepage copy

**Eyebrow:** PRODUCT TRUTH AS CODE · V0.1 DRAFT

# Keep product intent connected to what you ship.

Intentset connects what a product is meant to do with the slices that implement it, the checks that verify it, and the knowledge you share with customers.

Start with readable files in your repository. Build a product model that people and agents can follow.

**Primary:** Read the draft specification  
**Secondary:** Explore an example

**Status note:** The specifications are ready for review. The reference toolchain is being designed.

### Faster code needs a clearer product model.

A ticket explains why a change started. A test checks a result. A document describes a promise. Keeping them connected as the product changes is the hard part.

Intentset gives those connections a durable place in the repository—centered on observable product behavior.

### One behavior. A connected view.

**Example: Schedule an assessment**

A teacher chooses when a published assessment becomes available to a class.

- **Intent:** Help teachers prepare learning in advance.
- **Behavior:** Schedule an assessment for a future time.
- **Rule:** The assessment must be published and the teacher must be allowed to assign it.
- **Implementation:** One accountable slice, with explicit contracts and backend ownership.
- **Verification:** Named checks, with evidence tied to a particular snapshot.
- **Knowledge:** Reviewed guidance for the right audience and release.

**Example note:** Illustrative model. These links describe the proposed structure, not a live verification report.

### Start broad. Inspect the details when you need them.

**For product teams**  
Review capabilities and behaviors without reading every implementation detail. See where a promise is still unclear, unimplemented, or missing evidence.

**For engineers**  
Find the slice that owns a behavior, the contracts it exposes, and the rules a change must preserve.

**For people building with agents**  
Give an agent a bounded set of product context before it edits code. Review the resulting behavior, implementation, tests, and knowledge together.

### Open files. Explicit meaning.

Write in Markdown with YAML frontmatter. Give behaviors stable IDs. Link the rules, slices, checks, and explanations that belong together.

The repository stays authoritative. Graphs and review pages are views of those files.

**Link:** Explore the Core specification

### Rich documents, with Markset.

Intentset defines what the product model means. Markset provides the document layer for reading and sharing it.

Intentset profiles add metadata and document conventions without adding product-specific rendering syntax. The planned publisher turns reviewed product knowledge into portable Markset documents for people, support teams, and customer-facing answers.

**Link:** See how Markset fits

### Adopt one useful connection at a time.

1. **Describe a behavior.** Choose one promise your product makes.
2. **Name its owner.** Connect it to the slice that delivers it.
3. **Attach verification.** Identify what is checked and which evidence is current.
4. **Publish with context.** Review the explanation for its audience and release.

Keep your existing workflow. Expand the model as its value becomes clear.

### Specifications first. A reference toolchain next.

The v0.1 package defines the product model, traceable vertical slices, and a TypeScript + AWS Amplify Gen 2 reference profile.

Validation, change-impact reports, a Product Atlas, and agent context are on the implementation roadmap. They are not yet presented as finished tools.

**Links:** Read the specifications · View the roadmap

### Help make product intent easier to maintain.

Review the draft. Walk through the example. Try the model against one real capability and bring back what does not fit.

**Primary:** Read the draft specification  
**Secondary:** Start with one behavior

**Footer:** Intentset · An open-source project in development from Coral Reef Ventures. Markset, Intentset, and Streamlane can be adopted independently.

## Start page copy

# Start with one behavior.

You do not need to reorganize your repository to try the model. Choose one observable promise, then connect the evidence around it.

### 1. Write the promise

Describe the actor, trigger, successful result, and meaningful failure response. Give the behavior a stable ID. If two parts can be released or owned independently, consider separate behaviors.

### 2. State the constraints

Add rules and concrete scenarios. Reuse a shared rule through a link rather than copying its wording into every behavior.

### 3. Find the owner

Identify the slice accountable for delivering the behavior. Record its public contract and implementation paths, including backend resources that live elsewhere.

### 4. Connect the checks

Name the verification procedure and its stable selector. A linked test is useful, but a current passing run is a separate claim. Keep that distinction visible.

### 5. Review the explanation

Write audience-safe guidance for an exact release. Keep internal decisions and implementation details out of the customer projection unless they help the customer act.

**CTA:** Open the worked example  
**Next:** Read the Core specification

**Availability note:** This is a manual adoption guide for the v0.1 draft. There is no installation command in this package.

## Specifications page copy

# A small set of specifications. A shared product model.

Intentset separates product meaning from implementation architecture and platform choices. Adopt the Core model on its own, or connect it to traceable vertical slices.

### Core Specification v0.1

Identity, artifact types, relationships, lifecycle, evidence, Markset profiles, and audience-safe knowledge publication.

**CTA:** Read Core

### Traceable Vertical Slice Architecture v0.1

Behavior ownership, public contracts, dependencies, implementation claims, and verification boundaries.

**CTA:** Read Traceable VSA

### TypeScript + AWS Amplify Gen 2 Reference Profile v0.1

A concrete mapping for slice folders, import boundaries, backend seams, and logically owned cloud resources.

**CTA:** Read the reference profile

### What conformance means

A conformance report names its scope, snapshot, specification version, checks, and exceptions. Linked evidence is not the same as passing evidence, and passing tests do not prove every documented promise correct.

**Status:** All three documents are initial drafts. The TypeScript reference implementation is planned.

## Markset page copy

# Product meaning, in documents people can read.

Intentset and Markset have different jobs. Intentset defines the relationships between product intent, behavior, implementation, evidence, and knowledge. Markset supports portable, expressive documents.

### Metadata carries the model

An Intentset profile defines frontmatter fields, document sections, relationships, and validation rules. It does not invent a new rendering directive for every product concept.

### Publication carries the context

The planned publisher selects reviewed knowledge for a specific audience and release, then produces Markset documents with source provenance. Those documents can support a website, help center, or retrieval system.

### Source remains source

Generated pages are views. Product records remain versioned in the repository, and changing a source prompts review of dependent explanations.

**CTA:** Read the Markset integration section  
**External link:** Visit Markset

**Draft note:** Upstream Markset compatibility will be pinned and tested before the reference publisher ships.

## Roadmap page copy

# Build the connections before building more workflow.

The first goal is practical: take one real product behavior from readable source to implementation ownership, current evidence, and reviewed knowledge.

### Available in this draft

Core and architecture specifications, a TypeScript + Amplify profile, a worked model, an adoption roadmap, and site concepts.

### Next: validate the model

Build safe parsing, typed relationships, stable diagnostics, and independent conformance fixtures.

### Then: connect the repository

Resolve slice ownership and contracts, collect test evidence, and explain the impact of a change.

### Then: help people and agents review

Build a Product Atlas, reviewed Markset publication, and bounded agent context.

### Bring a real example

The most useful early feedback is a capability that is difficult to model, a boundary that is hard to enforce, or an explanation that is hard to publish safely.

**CTA:** Read the implementation roadmap

## About page copy

# Open foundations for a changing way of building software.

Intentset is being developed as an open-source framework for teams building with humans and AI agents. It starts from a simple need: keep the product's promises connected as implementation changes.

Coral Reef Ventures is the organization behind Intentset, Markset, and Streamlane. Each addresses a different part of the work: documents, product meaning, and work management. Each can be adopted independently.

The working name is Intentset. The specifications are in draft; repository, licensing, and contribution details will be published before the first public release.

**CTA (enable after public URL confirmation):** Explore Coral Reef Ventures  
**Secondary:** Read the draft

## Interaction and responsive notes

Desktop uses an editorial hero beside a traceability model; a full-width worked example; three audience cards; paired format/Markset sections; four adoption steps; and a clear draft status section. At 760px and below, navigation wraps, the hero and cards stack, and the model becomes a vertical sequence. Reading order remains meaningful without styling. Use visible focus states, ordinary links, a skip link, minimum 44px primary targets, and no hover-only information.

Wireframes use real copy, no fabricated testimonials or adoption statistics, no live-looking coverage percentages, no nonfunctional signup form, and no nonexistent repository destination. The responsive homepage and companion pages are offline review artifacts, not a deployed website.
