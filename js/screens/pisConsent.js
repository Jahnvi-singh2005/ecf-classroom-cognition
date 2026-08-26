// screens/pisConsent.js — Participant Information Sheet & Consent (pre-experiment, mouse allowed).
// Entry point of the flow — there is no way back to this screen once the participant proceeds.

import { goToPhase } from '../main.js';

const SCROLL_TOLERANCE_PX = 20;

let containerRef = null;

function render() {
  containerRef.innerHTML = `
    <div class="topbar"><span class="topbar-title">ECF Classroom Cognition — Reading Experiment</span></div>
    <div class="center-wrap" style="align-items:flex-start;padding-top:40px;overflow-y:auto;">
      <div class="form-card wide">
        <span class="eyebrow">Before we begin</span>
        <h1>Participant Information and Consent</h1>
        <p class="subtitle">Please read the full information sheet below. Scroll to the end to enable the acknowledgement checkbox.</p>

        <div class="consent-body pis-scroll" id="pis-scroll">
          <p><strong>Title of the project:</strong> Neural Correlates of C-A-P framework based Cognitive levels in Learning Tasks</p>
          <p><strong>Name of Investigators, Department:</strong> Dr. Saurabh Gandhi, BITS Pilani, Pilani Campus</p>

          <p><strong>1. Purpose of this project/study</strong></p>
          <p>The purpose of this project is to identify measurable differences in neural activity between effective and ineffective learning, and to establish whether a direct correlation exists between learning outcomes and electroencephalographic (EEG) activity.</p>

          <p><strong>2. Procedure/methods of the study</strong></p>
          <p>If you volunteer to participate in this study, you will be asked to do the following:</p>
          <p><strong>Experimental Task and Procedure</strong></p>
          <ul class="instr-list">
            <li>Read four structured passages presented on a web application designed to elicit varying cognitive levels according to the C-A-P framework.</li>
            <li>Respond to 4–5 embedded in-text questions where applicable, followed by a 6-question post-reading assessment and a brief feedback survey regarding learning gains after each passage.</li>
            <li>Navigate the application exclusively using designated keyboard commands; mouse input will be disabled during passage presentation.</li>
          </ul>
          <p><strong>EEG Recording and Protocol Requirements</strong></p>
          <ul class="instr-list">
            <li>Undergo continuous, non-invasive electroencephalographic (EEG) monitoring using a 16-channel OpenBCI system with a safe, water-soluble conductive gel applied at specific electrode sites.</li>
            <li>Adhere to pre-test preparation guidelines: arrive with clean, dry hair free of styling products, abstain from central nervous system stimulants (e.g., caffeine, energy drinks) prior to testing, and maintain routine prescribed medications.</li>
            <li>Minimize artifact interference during active recording periods by avoiding excessive blinking, jaw clenching, facial movement, speaking, and bodily posture shifts.</li>
          </ul>
          <p><strong>Rest Intervals and Eligibility</strong></p>
          <ul class="instr-list">
            <li>Utilize optional 1–2 minute rest intervals between individual passages and a required 5–10 minute rest period following completion of the second passage.</li>
            <li>Maintain sustained attention throughout the tasks. Full eligibility for participant compensation requires achieving a minimum cumulative score of 50% on the post-reading assessments.</li>
          </ul>

          <p><strong>3. Expected duration of the subject participation</strong></p>
          <p>60 min (15 min preparation + 45 min task duration)</p>

          <p><strong>4. The benefits to be expected from the research to the participant or to others and the post-trial responsibilities of the investigator.</strong></p>
          <p>The potential benefit of the study includes understanding the underlying neural mechanism of levels of learning deemed to be more effective (i.e., Constructive) by C-A-P framework as opposed to low levels of learning (Passive)</p>

          <p><strong>5. Any risks expected from the study to the participant:</strong> This study carries minimal risk. Participants may experience mild fatigue from screen reading or minor discomfort from sitting still during the EEG recording.</p>
          <p>To minimize fatigue, regular breaks are provided throughout the session (1–2 minutes between texts and a 5–10 minute break midway). The EEG gel is safe, non-toxic, and easily washes out with water. Participants are free to pause or withdraw from the study at any time.</p>

          <p><strong>6. Maintenance of confidentiality of records</strong></p>
          <p>All personal information and data collected during the study will be kept confidential and securely stored. Access to participant records will be restricted to authorized research personnel only, and data will be anonymized and coded to ensure participant privacy. Any published results or reports will be presented in aggregate form to further protect participant identities.</p>

          <p><strong>7. Provision of free treatment for research related injury.</strong></p>
          <p>Not applicable, as this study involves non-invasive procedures and poses no physical risks. The study focuses on EEG data collection and psychological assessments. Therefore, compensation for disability or death resulting from injury is not necessary for this study.</p>

          <p><strong>8. Reimbursement for participating in the study:</strong> Participants will be compensated Rs. 250 for the time they dedicate to the experiment.</p>

          <p><strong>9. Compensation to the participants for foreseeable risks and unforeseeable risks related to research study leading to disability or death:</strong></p>
          <p>Not applicable</p>

          <p><strong>10. Possible current and future uses of the biological material to be generated from the research and if the material is likely to be used for secondary purposes or would be shared with others, this should be mentioned:</strong></p>
          <p>No biological material will be collected as part of the study. Only biophysical signals will be collected non-invasively.</p>

          <p><strong>11. Possible current and future uses of the data to be generated from the research and if the data is likely to be used for secondary purposes or would be shared with others, this should be mentioned</strong></p>
          <p>The data will be carefully anonymized and made available publicly at most 1.5 years after the collection. It may be used for further analyses by other researchers.</p>

          <p><strong>12. Contact details of the Principal investigator (PI):</strong></p>
          <p>Email: saurabh.gandhi@pilani.bits-pilani.ac.in</p>

          <p><strong>13. For other queries/ complaints, contact:</strong></p>
          <p>Prof. Rajeev Taliyan<br>Professor &amp; Head, Department of Pharmacy, BITS Pilani, Pilani Campus</p>

          <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;">

          <p><strong>PIS Acknowledgement</strong></p>
        </div>

        <div class="consent-check-row">
          <input type="checkbox" id="pis-check" disabled/>
          <label for="pis-check">I have read and understand the Participant Information Sheet and my questions have been satisfactorily answered.</label>
        </div>
        <span class="field-hint" id="pis-scroll-hint">Scroll to the end of the document above to enable this checkbox.</span>
        <button type="button" id="btn-proceed" class="btn btn-primary" disabled>Proceed →</button>
      </div>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  const scrollBody = containerRef.querySelector('#pis-scroll');
  const checkbox = containerRef.querySelector('#pis-check');
  const scrollHint = containerRef.querySelector('#pis-scroll-hint');
  const button = containerRef.querySelector('#btn-proceed');

  function checkScrolledToBottom() {
    const reachedBottom = scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - SCROLL_TOLERANCE_PX;
    if (reachedBottom && checkbox.disabled) {
      checkbox.disabled = false;
      scrollHint.style.display = 'none';
    }
  }

  scrollBody.addEventListener('scroll', checkScrolledToBottom);
  checkScrolledToBottom();

  checkbox.addEventListener('change', () => {
    button.disabled = !checkbox.checked;
  });

  button.addEventListener('click', () => {
    if (!checkbox.checked) return;
    goToPhase('registration');
  });
}

export function mount(container) {
  containerRef = container;
  render();
}

export function unmount() {
  containerRef = null;
}
