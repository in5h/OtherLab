export default function WelcomeScreen() {
  return (
    <div className="welcome-screen" role="status" aria-live="polite">
      <div className="welcome-content">
        <p>Welcome to OtherLab</p>
        <span>Have a suggestion, idea, or a website that needs a closer look?</span>
        <div className="welcome-actions">
          <a href="mailto:insharahaman8@gmail.com?subject=An%20idea%20for%20OtherLab">
            Share an idea
          </a>
          <a href="/contact">Reach out</a>
        </div>
      </div>
    </div>
  );
}
