export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: '#050816' }}>
      <div className="max-w-3xl mx-auto px-4 py-16">
        <a href="/" className="text-indigo-400 text-sm hover:text-indigo-300 mb-8 inline-block">← Back to SpaceHub</a>

        <div className="space-card p-8 space-y-8">
          <div>
            <h1 className="text-3xl font-black text-white mb-2">Privacy Policy</h1>
            <p className="text-gray-500 text-sm">Last updated: June 20, 2026</p>
          </div>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">1. Introduction</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              SpaceHub ("we", "our", or "us") operates the website spacehubapp.com (the "Service").
              This page informs you of our policies regarding the collection, use, and disclosure of personal data
              when you use our Service and the choices you have associated with that data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">2. Data We Collect</h2>
            <div className="space-y-2 text-sm text-gray-400">
              <p><strong className="text-white">Location data:</strong> When you use the ISS tracking feature, we request your geographic location. This data is processed locally in your browser and is never stored on our servers.</p>
              <p><strong className="text-white">Email address:</strong> If you subscribe to our newsletter, we collect your email address to send you space-related updates.</p>
              <p><strong className="text-white">Usage data:</strong> We may collect information on how the Service is accessed and used (e.g., pages visited, time spent).</p>
              <p><strong className="text-white">Cookies:</strong> We use cookies and similar tracking technologies to track activity on our Service and hold certain information.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">3. Google AdSense & Advertising</h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              We use Google AdSense to display advertisements. Google AdSense uses cookies to serve ads based on your prior visits to our website or other websites. Google's use of advertising cookies enables it and its partners to serve ads based on your visit to our site and/or other sites on the Internet.
            </p>
            <p className="text-gray-400 text-sm leading-relaxed">
              You may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google Ads Settings</a>.
              Alternatively, you can opt out of a third-party vendor's use of cookies by visiting <a href="http://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">aboutads.info</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">4. Third-Party APIs</h2>
            <div className="space-y-2 text-sm text-gray-400">
              <p>Our Service uses the following third-party APIs:</p>
              <ul className="space-y-1 mt-2">
                {[
                  ['NASA APOD API', 'Astronomy Picture of the Day', 'api.nasa.gov'],
                  ['Where the ISS At?', 'Real-time ISS position data', 'wheretheiss.at'],
                  ['Open Notify', 'Astronaut data', 'open-notify.org'],
                  ['Spaceflight News API', 'Space news articles', 'spaceflightnewsapi.net'],
                ].map(([name, desc, domain]) => (
                  <li key={name} className="flex items-start gap-2">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span><strong className="text-white">{name}</strong> ({domain}) — {desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">5. Data Retention</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              We retain your personal data only for as long as necessary for the purposes set out in this policy.
              Email addresses collected through newsletter signup are retained until you unsubscribe.
              Location data is never stored — it is used only in real-time within your browser session.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">6. Your Rights (GDPR)</h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">If you are located in the European Economic Area (EEA), you have certain data protection rights:</p>
            <ul className="space-y-1 text-sm text-gray-400">
              {[
                'Right to access your personal data',
                'Right to rectification of inaccurate data',
                'Right to erasure ("right to be forgotten")',
                'Right to restrict processing',
                'Right to data portability',
                'Right to object to processing',
              ].map(r => (
                <li key={r} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {r}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">7. Cookies Policy</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Cookies are files with a small amount of data placed on your device. We use:
            </p>
            <div className="mt-3 space-y-2 text-sm">
              {[
                { type: 'Essential', desc: 'Required for the Service to function (e.g., language preference)', color: 'text-green-400' },
                { type: 'Analytics', desc: 'Help us understand how visitors interact with the Service', color: 'text-blue-400' },
                { type: 'Advertising', desc: 'Used by Google AdSense to display relevant advertisements', color: 'text-yellow-400' },
              ].map(c => (
                <div key={c.type} className="flex gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                  <span className={`font-semibold ${c.color} w-24 flex-shrink-0`}>{c.type}</span>
                  <span className="text-gray-500">{c.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">8. Children's Privacy</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Our Service does not address anyone under the age of 13. We do not knowingly collect personally identifiable information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">9. Changes to This Policy</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-indigo-300 mb-3">10. Contact Us</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at:
              <a href="mailto:aliexpressgood585@gmail.com" className="text-indigo-400 hover:underline ml-1">aliexpressgood585@gmail.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
