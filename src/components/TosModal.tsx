import styles from './TosModal.module.css';

interface Props {
  onClose: () => void;
}

export default function TosModal({ onClose }: Props) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Terms of Service</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.section}>1. Acceptance of Terms</p>
          <p className={styles.para}>By accessing or using Zeeble's services (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.</p>

          <p className={styles.section}>2. Description of Service</p>
          <p className={styles.para}>Zeeble is a self-hosted, Discord-style chat platform with real-time messaging, voice/video rooms, file sharing, and a bot API. The Service includes both self-hosted deployment options and cloud-hosted services.</p>

          <p className={styles.section}>3. User Accounts</p>
          <p className={styles.para}>To access certain features of the Service, you may need to create an account. You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.</p>

          <p className={styles.section}>4. Beam Identity</p>
          <p className={styles.para}>Zeeble uses a "Beam Identity" system (username»tag format) that works across self-hosted and cloud deployments. You are responsible for maintaining the security of your Beam Identity and for all activities that occur under your account.</p>

          <p className={styles.section}>5. Self-Hosted Deployments</p>
          <p className={styles.para}>For self-hosted deployments using PhaseLink or other Zeeble components: you are responsible for obtaining and maintaining all necessary hardware, software, and network infrastructure; you are responsible for securing your self-hosted instance; Zeeble does not have access to your self-hosted data unless you explicitly configure integrations; you must comply with all applicable laws when operating your self-hosted instance.</p>

          <p className={styles.section}>6. Cloud Services</p>
          <p className={styles.para}>For users of Zeeble's cloud-hosted services: you receive 10 free Zeeble cloud servers with a free account. Premium subscriptions provide additional cloud servers and features. Cloud services are provided "as is" and "as available" without warranties.</p>

          <p className={styles.section}>7. Premium Subscriptions</p>
          <p className={styles.para}>Zeeble offers Premium subscriptions with enhanced features. Subscriptions are billed monthly or annually. Payment processing is handled by Stripe. You may cancel your subscription at any time; cancellation will take effect at the end of the current billing period.</p>

          <p className={styles.section}>8. User Content</p>
          <p className={styles.para}>You retain ownership of any content you submit, post, or display on or through the Service. By submitting content, you grant Zeeble a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, adapt, publish, translate, distribute, and display such content solely for the purpose of providing and promoting the Service.</p>

          <p className={styles.section}>9. Prohibited Conduct</p>
          <p className={styles.para}>You agree not to use the Service to: violate any applicable laws or regulations; infringe upon the rights of others, including intellectual property rights; transmit malware, viruses, or other harmful code; engage in spam, phishing, or other malicious activities; harass, abuse, or threaten other users; attempt to gain unauthorized access to Zeeble's systems or other users' accounts.</p>

          <p className={styles.section}>10. Moderation</p>
          <p className={styles.para}>Zeeble reserves the right to remove or refuse to distribute any content on the Service, suspend or terminate accounts that violate these Terms, and report suspected illegal activities to law enforcement.</p>

          <p className={styles.section}>11. Privacy</p>
          <p className={styles.para}>Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, and share your information.</p>

          <p className={styles.section}>12. Intellectual Property</p>
          <p className={styles.para}>The Service and its original content, features, and functionality are owned by Zeeble and are protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.</p>

          <p className={styles.section}>13. Third-Party Links</p>
          <p className={styles.para}>The Service may contain links to third-party websites or services that are not owned or controlled by Zeeble. Zeeble has no control over, and assumes no responsibility for, the content, privacy policies, or practices of any third-party websites or services.</p>

          <p className={styles.section}>14. Disclaimer of Warranties</p>
          <p className={styles.para}>The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>

          <p className={styles.section}>15. Limitation of Liability</p>
          <p className={styles.para}>To the maximum extent permitted by law, Zeeble shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your access to or use of the Service.</p>

          <p className={styles.section}>16. Indemnification</p>
          <p className={styles.para}>You agree to defend, indemnify, and hold harmless Zeeble and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including without limitation reasonable attorney's fees and costs, arising out of or in any way connected with your access to or use of the Service.</p>

          <p className={styles.section}>17. Termination</p>
          <p className={styles.para}>Zeeble may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>

          <p className={styles.section}>18. Changes to Terms</p>
          <p className={styles.para}>Zeeble reserves the right, at its sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect.</p>

          <p className={styles.section}>19. Governing Law</p>
          <p className={styles.para}>These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which Zeeble operates, without regard to its conflict of law provisions.</p>

          <p className={styles.section}>20. Contact Information</p>
          <p className={styles.para}>If you have any questions about these Terms, please contact us at: legal@zeeble.app</p>

          <p className={styles.section}>21. Effective Date</p>
          <p className={styles.para}>These Terms are effective as of March 30, 2026.</p>
        </div>
      </div>
    </div>
  );
}
