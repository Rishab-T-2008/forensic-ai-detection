# AI / REAL browser extension

This starter supports Chrome and Firefox Manifest V3-compatible builds. Load this folder as an unpacked extension while the local backend is running on `http://localhost:8000`.

Right-click an image in a page and choose **Run AI / REAL forensics**. The result is shown as a temporary overlay on the current page.

The extension intentionally sends the image to the local service only. Before publishing, add host permissions for the deployed API, a settings screen for the API URL, and a privacy policy.
