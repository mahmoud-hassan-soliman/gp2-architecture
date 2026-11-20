# GP2 Architecture

This site contains the GP2 conceptual architecture and a date-filtered team checklist for the 20 November through 19 December 2026 plan.

## Team use

- On **Home**, select a team member. **Due through today** includes every assigned task scheduled through the current date. **Next 7 days** covers tomorrow through the seventh following calendar day, using Cairo time. Checkboxes save separately by task ID in this browser. Clearing browser data removes the saved checkmarks.
- In **Architecture**, select a component or connection to inspect it. Use **Edit diagram** to move components, change technology or labels, add components, and drag between handles to connect them. A layer can be opened from the navigation or from its component.
- Changes to a diagram save as a browser draft. **Export JSON** creates a file to share. **Import JSON** replaces the local draft after confirmation. Resetting loads the current published baseline.

The schedule includes the publicly approved team assignments. Team member selection is a view filter. Browser-local drafts and checkmarks are independent across devices and users.

## Make a change available to everyone

Review the exported JSON, update `src/architecture.json` and rebuild. The shared task plan is in `src/team-plan.json`; preserve task IDs when revising dates or evidence.

```sh
npm ci
npm test
npm run dev
npm run build -- --outDir docs
```

GitHub Pages serves `docs/` from `main`. Build and commit both source and generated pages when publishing changes. Technology icons are included locally with attribution in `public/icons/`.
