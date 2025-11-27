# Future Tasks: Screen Share & Voice Call

The Chat UI and core messaging features (including join requests) have been restored. The following advanced WebRTC features are currently implemented in the code but may require further testing and refinement to be fully production-ready.

## 1. Voice Call
- [ ] **Verify Audio Stream Handling:** Ensure `navigator.mediaDevices.getUserMedia({ audio: true })` works consistently across browsers.
- [ ] **Test ICE Candidate Exchange:** Confirm that ICE candidates are correctly exchanged and added to the peer connection for audio-only calls.
- [ ] **UI Feedback:** Add visual indicators for "Calling...", "Connected", and "Call Ended".
- [ ] **Error Handling:** Improve error messages for microphone access denial.

## 2. Screen Sharing
- [ ] **Verify Display Media:** Ensure `navigator.mediaDevices.getDisplayMedia({ video: true })` correctly captures the screen.
- [ ] **Video Element Sizing:** Adjust the remote video container to handle different aspect ratios (e.g., sharing a vertical window vs. a widescreen monitor).
- [ ] **Switching Streams:** Test the flow of switching from a voice call to screen sharing and vice versa.
- [ ] **Stop Sharing:** Ensure the "Stop Sharing" button correctly terminates the track and notifies the peer.

## 3. General WebRTC Improvements
- [ ] **STUN/TURN Servers:** The current config uses a public Google STUN server. For production, a TURN server (e.g., Coturn) is recommended to handle symmetric NATs.
- [ ] **Connection State:** Add listeners for `peerConnection.onconnectionstatechange` to handle disconnects gracefully.
- [ ] **Multi-User Calls:** The current implementation is a simple mesh or 1-on-1. Evaluate if a SFU (Selective Forwarding Unit) is needed for group calls.
