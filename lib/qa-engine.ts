export type TestStatus =
  | "passed"
  | "failed"
  | "warning"
  | "skipped";

export type TestSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export interface QATest {
  id: string;
  category: string;
  name: string;
  description: string;
  status: TestStatus;
  severity: TestSeverity;
  expected?: string;
  actual?: string;
  location?: string;
  page?: string;
}

export interface QASummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  completed: number;
  score: number;
}

export function createTest(
  data: Omit<QATest, "status"> & {
    status?: TestStatus;
  }
): QATest {
  return {
    ...data,
    status: data.status ?? "skipped",
  };
}

/*
|--------------------------------------------------------------------------
| QA SCORE
|--------------------------------------------------------------------------
|
| The score only considers tests that were actually executed.
|
| Passed  = no penalty
| Warning = small penalty
| Failed  = penalty based on severity
| Skipped = does not affect score
|
*/

export function calculateQAScore(
  tests: QATest[]
): number {
  const completed = tests.filter(
    (test) => test.status !== "skipped"
  );

  if (completed.length === 0) {
    return 0;
  }

  let score = 100;

  for (const test of completed) {
    if (test.status === "failed") {
      if (test.severity === "critical") {
        score -= 15;
      }

      if (test.severity === "high") {
        score -= 10;
      }

      if (test.severity === "medium") {
        score -= 5;
      }

      if (test.severity === "low") {
        score -= 2;
      }
    }

    if (test.status === "warning") {
      if (test.severity === "critical") {
        score -= 8;
      }

      if (test.severity === "high") {
        score -= 5;
      }

      if (test.severity === "medium") {
        score -= 3;
      }

      if (test.severity === "low") {
        score -= 1;
      }
    }
  }

  return Math.max(
    0,
    Math.min(100, Math.round(score))
  );
}

/*
|--------------------------------------------------------------------------
| SUMMARY
|--------------------------------------------------------------------------
*/

export function summarizeTests(
  tests: QATest[]
): QASummary {
  const passed = tests.filter(
    (test) => test.status === "passed"
  ).length;

  const failed = tests.filter(
    (test) => test.status === "failed"
  ).length;

  const warnings = tests.filter(
    (test) => test.status === "warning"
  ).length;

  const skipped = tests.filter(
    (test) => test.status === "skipped"
  ).length;

  const completed =
    passed +
    failed +
    warnings;

  return {
    total: tests.length,
    passed,
    failed,
    warnings,
    skipped,
    completed,
    score: calculateQAScore(tests),
  };
}

/*
|--------------------------------------------------------------------------
| TINYQA QA CHECKLIST
|--------------------------------------------------------------------------
*/

export const QA_CHECKLIST: QATest[] = [

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  createTest({
    id: "AUTH-001",
    category: "Authentication",
    name: "Sign up with valid details",
    description:
      "User can create an account using valid information.",
    severity: "critical",
  }),

  createTest({
    id: "AUTH-002",
    category: "Authentication",
    name: "Sign up with invalid details",
    description:
      "Invalid registration data is rejected.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-003",
    category: "Authentication",
    name: "Required-field validation",
    description:
      "Required fields cannot be submitted empty.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-004",
    category: "Authentication",
    name: "Duplicate email validation",
    description:
      "Existing email addresses cannot create duplicate accounts.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-005",
    category: "Authentication",
    name: "Email verification",
    description:
      "New accounts can complete email verification.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-006",
    category: "Authentication",
    name: "Login with valid credentials",
    description:
      "Valid users can log in.",
    severity: "critical",
  }),

  createTest({
    id: "AUTH-007",
    category: "Authentication",
    name: "Login with incorrect password",
    description:
      "Incorrect passwords are rejected.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-008",
    category: "Authentication",
    name: "Login with unregistered email",
    description:
      "Unknown users cannot authenticate.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-009",
    category: "Authentication",
    name: "Password visibility toggle",
    description:
      "Password visibility can be toggled.",
    severity: "low",
  }),

  createTest({
    id: "AUTH-010",
    category: "Authentication",
    name: "Password strength validation",
    description:
      "Weak passwords are rejected.",
    severity: "medium",
  }),

  createTest({
    id: "AUTH-011",
    category: "Authentication",
    name: "Forgot password",
    description:
      "Password recovery can be initiated.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-012",
    category: "Authentication",
    name: "Reset password link",
    description:
      "Valid reset links open correctly.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-013",
    category: "Authentication",
    name: "Expired reset link",
    description:
      "Expired reset links are rejected.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-014",
    category: "Authentication",
    name: "Invalid reset token",
    description:
      "Invalid reset tokens are rejected.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-015",
    category: "Authentication",
    name: "Logout",
    description:
      "Users can securely log out.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-016",
    category: "Authentication",
    name: "Session expiration",
    description:
      "Expired sessions are handled correctly.",
    severity: "high",
  }),

  createTest({
    id: "AUTH-017",
    category: "Authentication",
    name: "Protected pages",
    description:
      "Logged-out users cannot access protected pages.",
    severity: "critical",
  }),

  // =====================================================
  // DASHBOARD
  // =====================================================

  createTest({
    id: "DASH-001",
    category: "Dashboard",
    name: "Dashboard loads correctly",
    description:
      "Dashboard renders without errors.",
    severity: "critical",
  }),

  createTest({
    id: "DASH-002",
    category: "Dashboard",
    name: "User information",
    description:
      "User information displays correctly.",
    severity: "high",
  }),

  createTest({
    id: "DASH-003",
    category: "Dashboard",
    name: "Navigation works",
    description:
      "Dashboard navigation works correctly.",
    severity: "high",
  }),

  createTest({
    id: "DASH-004",
    category: "Dashboard",
    name: "Buttons work",
    description:
      "Dashboard buttons perform their expected actions.",
    severity: "high",
  }),

  createTest({
    id: "DASH-005",
    category: "Dashboard",
    name: "Cards display correct data",
    description:
      "Dashboard cards display accurate information.",
    severity: "medium",
  }),

  createTest({
    id: "DASH-006",
    category: "Dashboard",
    name: "Empty states",
    description:
      "Empty states are displayed correctly.",
    severity: "medium",
  }),

  createTest({
    id: "DASH-007",
    category: "Dashboard",
    name: "Loading states",
    description:
      "Loading states are displayed correctly.",
    severity: "low",
  }),

  createTest({
    id: "DASH-008",
    category: "Dashboard",
    name: "Error states",
    description:
      "Dashboard errors are handled correctly.",
    severity: "high",
  }),

  createTest({
    id: "DASH-009",
    category: "Dashboard",
    name: "Refresh persistence",
    description:
      "Refreshing does not unexpectedly lose data.",
    severity: "high",
  }),

  // =====================================================
  // APPLICATION
  // =====================================================

  createTest({
    id: "APP-001",
    category: "Application",
    name: "Application form opens",
    description:
      "Application form loads correctly.",
    severity: "critical",
  }),

  createTest({
    id: "APP-002",
    category: "Application",
    name: "All fields are present",
    description:
      "Expected application fields are present.",
    severity: "high",
  }),

  createTest({
    id: "APP-003",
    category: "Application",
    name: "Required fields",
    description:
      "Required fields are validated.",
    severity: "high",
  }),

  createTest({
    id: "APP-004",
    category: "Application",
    name: "Email validation",
    description:
      "Invalid emails are rejected.",
    severity: "medium",
  }),

  createTest({
    id: "APP-005",
    category: "Application",
    name: "Phone validation",
    description:
      "Invalid phone numbers are rejected.",
    severity: "medium",
  }),

  createTest({
    id: "APP-006",
    category: "Application",
    name: "Date validation",
    description:
      "Invalid dates are rejected.",
    severity: "medium",
  }),

  createTest({
    id: "APP-007",
    category: "Application",
    name: "Character limits",
    description:
      "Character limits are enforced.",
    severity: "low",
  }),

  createTest({
    id: "APP-008",
    category: "Application",
    name: "Invalid input handling",
    description:
      "Invalid input is handled safely.",
    severity: "high",
  }),

  createTest({
    id: "APP-009",
    category: "Application",
    name: "Save and continue",
    description:
      "Application progress can be saved.",
    severity: "high",
  }),

  createTest({
    id: "APP-010",
    category: "Application",
    name: "Back and next navigation",
    description:
      "Multi-step navigation works.",
    severity: "high",
  }),

  createTest({
    id: "APP-011",
    category: "Application",
    name: "Data persistence",
    description:
      "Application data persists between steps.",
    severity: "critical",
  }),

  createTest({
    id: "APP-012",
    category: "Application",
    name: "Form submission",
    description:
      "Completed applications can be submitted.",
    severity: "critical",
  }),

  createTest({
    id: "APP-013",
    category: "Application",
    name: "Duplicate submission",
    description:
      "Duplicate applications are prevented.",
    severity: "critical",
  }),

  createTest({
    id: "APP-014",
    category: "Application",
    name: "Submission confirmation",
    description:
      "Successful submission displays confirmation.",
    severity: "high",
  }),

  // =====================================================
  // UNIVERSITY SEARCH
  // =====================================================

  createTest({
    id: "UNI-001",
    category: "University Search",
    name: "Search works",
    description:
      "University search returns results.",
    severity: "critical",
  }),

  createTest({
    id: "UNI-002",
    category: "University Search",
    name: "Exact university search",
    description:
      "Exact university names return the correct result.",
    severity: "high",
  }),

  createTest({
    id: "UNI-003",
    category: "University Search",
    name: "Partial search",
    description:
      "Partial searches return relevant results.",
    severity: "medium",
  }),

  createTest({
    id: "UNI-004",
    category: "University Search",
    name: "No-result search",
    description:
      "No-result searches show an empty state.",
    severity: "medium",
  }),

  createTest({
    id: "UNI-005",
    category: "University Search",
    name: "Filters",
    description:
      "University filters work.",
    severity: "high",
  }),

  createTest({
    id: "UNI-006",
    category: "University Search",
    name: "Multiple filters",
    description:
      "Multiple filters work together.",
    severity: "high",
  }),

  createTest({
    id: "UNI-007",
    category: "University Search",
    name: "Sorting",
    description:
      "Sorting produces the expected order.",
    severity: "medium",
  }),

  createTest({
    id: "UNI-008",
    category: "University Search",
    name: "University details",
    description:
      "University details open correctly.",
    severity: "high",
  }),

  createTest({
    id: "UNI-009",
    category: "University Search",
    name: "Tuition data",
    description:
      "Tuition information displays correctly.",
    severity: "high",
  }),

  createTest({
    id: "UNI-010",
    category: "University Search",
    name: "Programs",
    description:
      "Programs display correctly.",
    severity: "high",
  }),

  createTest({
    id: "UNI-011",
    category: "University Search",
    name: "Rankings",
    description:
      "Ranking information displays correctly.",
    severity: "medium",
  }),

  createTest({
    id: "UNI-012",
    category: "University Search",
    name: "Acceptance rate",
    description:
      "Acceptance-rate information displays correctly.",
    severity: "medium",
  }),

  createTest({
    id: "UNI-013",
    category: "University Search",
    name: "Pagination",
    description:
      "Pagination or infinite scrolling works.",
    severity: "medium",
  }),

  createTest({
    id: "UNI-014",
    category: "University Search",
    name: "University links",
    description:
      "University links work.",
    severity: "medium",
  }),

  // =====================================================
  // CART
  // =====================================================

  createTest({
    id: "CART-001",
    category: "Cart",
    name: "Add item",
    description:
      "Items can be added to the cart.",
    severity: "critical",
  }),

  createTest({
    id: "CART-002",
    category: "Cart",
    name: "Remove item",
    description:
      "Items can be removed from the cart.",
    severity: "high",
  }),

  createTest({
    id: "CART-003",
    category: "Cart",
    name: "Quantity controls",
    description:
      "Item quantities update correctly.",
    severity: "high",
  }),

  createTest({
    id: "CART-004",
    category: "Cart",
    name: "Correct item count",
    description:
      "Displayed count matches actual cart contents.",
    severity: "high",
  }),

  createTest({
    id: "CART-005",
    category: "Cart",
    name: "Correct cart total",
    description:
      "Cart total is calculated correctly.",
    severity: "critical",
  }),

  createTest({
    id: "CART-006",
    category: "Cart",
    name: "Cart icon count",
    description:
      "Cart icon count matches actual items.",
    severity: "medium",
  }),

  createTest({
    id: "CART-007",
    category: "Cart",
    name: "Cart persistence",
    description:
      "Cart persists after refresh.",
    severity: "high",
  }),

  createTest({
    id: "CART-008",
    category: "Cart",
    name: "Duplicate items",
    description:
      "Duplicate items are handled correctly.",
    severity: "medium",
  }),

  createTest({
    id: "CART-009",
    category: "Cart",
    name: "Bundle replacement",
    description:
      "Bundle replacement logic works correctly.",
    severity: "critical",
  }),

  createTest({
    id: "CART-010",
    category: "Cart",
    name: "Empty cart",
    description:
      "Empty cart state works correctly.",
    severity: "low",
  }),

  // =====================================================
  // PAYMENTS
  // =====================================================

  createTest({
    id: "PAY-001",
    category: "Payments",
    name: "Payment page loads",
    description:
      "Payment page loads correctly.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-002",
    category: "Payments",
    name: "Correct amount",
    description:
      "Correct payment amount is displayed.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-003",
    category: "Payments",
    name: "Correct product",
    description:
      "Correct product is displayed.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-004",
    category: "Payments",
    name: "Payment gateway",
    description:
      "Payment gateway opens correctly.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-005",
    category: "Payments",
    name: "Successful payment",
    description:
      "Successful payments are handled correctly.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-006",
    category: "Payments",
    name: "Failed payment",
    description:
      "Failed payments are handled correctly.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-007",
    category: "Payments",
    name: "Cancelled payment",
    description:
      "Cancelled payments are handled correctly.",
    severity: "high",
  }),

  createTest({
    id: "PAY-008",
    category: "Payments",
    name: "Expired payment",
    description:
      "Expired payments are handled correctly.",
    severity: "high",
  }),

  createTest({
    id: "PAY-009",
    category: "Payments",
    name: "Payment timeout",
    description:
      "Payment timeouts are handled correctly.",
    severity: "high",
  }),

  createTest({
    id: "PAY-010",
    category: "Payments",
    name: "Payment status",
    description:
      "Payment status updates correctly.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-011",
    category: "Payments",
    name: "Transaction reference",
    description:
      "Transaction references are stored correctly.",
    severity: "high",
  }),

  createTest({
    id: "PAY-012",
    category: "Payments",
    name: "Receipt generation",
    description:
      "Receipts are generated correctly.",
    severity: "high",
  }),

  createTest({
    id: "PAY-013",
    category: "Payments",
    name: "Receipt amount",
    description:
      "Receipt amount matches the payment.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-014",
    category: "Payments",
    name: "Duplicate transaction prevention",
    description:
      "Duplicate transactions are prevented.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-015",
    category: "Payments",
    name: "Refresh during payment",
    description:
      "Refreshing does not create duplicate transactions.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-016",
    category: "Payments",
    name: "Return URL",
    description:
      "Payment return URL works correctly.",
    severity: "high",
  }),

  createTest({
    id: "PAY-017",
    category: "Payments",
    name: "IPN or webhook",
    description:
      "Payment callbacks are processed correctly.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-018",
    category: "Payments",
    name: "Late callback",
    description:
      "Late or missing callbacks are handled.",
    severity: "critical",
  }),

  createTest({
    id: "PAY-019",
    category: "Payments",
    name: "Five-minute timer",
    description:
      "Payment timer expires correctly.",
    severity: "high",
  }),

  // =====================================================
  // SECURITY
  // =====================================================

  createTest({
    id: "SEC-001",
    category: "Security",
    name: "HTTPS",
    description:
      "Website uses HTTPS.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-002",
    category: "Security",
    name: "Password protection",
    description:
      "Passwords are not exposed.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-003",
    category: "Security",
    name: "Authentication token protection",
    description:
      "Authentication tokens are protected.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-004",
    category: "Security",
    name: "Unauthorized API access",
    description:
      "Unauthorized API requests are rejected.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-005",
    category: "Security",
    name: "User data isolation",
    description:
      "Users cannot access another user's data.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-006",
    category: "Security",
    name: "IDOR protection",
    description:
      "Unauthorized object references are rejected.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-007",
    category: "Security",
    name: "XSS protection",
    description:
      "User-controlled content is safely handled.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-008",
    category: "Security",
    name: "SQL injection protection",
    description:
      "Database inputs are safely handled.",
    severity: "critical",
  }),

  createTest({
    id: "SEC-009",
    category: "Security",
    name: "CSRF protection",
    description:
      "State-changing requests are appropriately protected.",
    severity: "high",
  }),

  createTest({
    id: "SEC-010",
    category: "Security",
    name: "Rate limiting",
    description:
      "Sensitive endpoints have rate limiting.",
    severity: "high",
  }),

  createTest({
    id: "SEC-011",
    category: "Security",
    name: "Secure cookies",
    description:
      "Authentication cookies use secure attributes.",
    severity: "high",
  }),

  createTest({
    id: "SEC-012",
    category: "Security",
    name: "Sensitive URL data",
    description:
      "Sensitive information is not exposed in URLs.",
    severity: "high",
  }),

  createTest({
    id: "SEC-013",
    category: "Security",
    name: "Information leakage",
    description:
      "Errors do not expose internal information.",
    severity: "high",
  }),

  // =====================================================
  // UI / UX
  // =====================================================

  createTest({
    id: "UI-001",
    category: "UI/UX",
    name: "Desktop layout",
    description:
      "Desktop layout renders correctly.",
    severity: "medium",
  }),

  createTest({
    id: "UI-002",
    category: "UI/UX",
    name: "Tablet layout",
    description:
      "Tablet layout renders correctly.",
    severity: "medium",
  }),

  createTest({
    id: "UI-003",
    category: "UI/UX",
    name: "Mobile layout",
    description:
      "Mobile layout renders correctly.",
    severity: "high",
  }),

  createTest({
    id: "UI-004",
    category: "UI/UX",
    name: "No overlapping elements",
    description:
      "Important elements do not overlap.",
    severity: "medium",
  }),

  createTest({
    id: "UI-005",
    category: "UI/UX",
    name: "No clipped text",
    description:
      "Text is not unexpectedly clipped.",
    severity: "low",
  }),

  createTest({
    id: "UI-006",
    category: "UI/UX",
    name: "Button states",
    description:
      "Buttons have correct states.",
    severity: "medium",
  }),

  createTest({
    id: "UI-007",
    category: "UI/UX",
    name: "Loading indicators",
    description:
      "Loading indicators appear correctly.",
    severity: "low",
  }),

  createTest({
    id: "UI-008",
    category: "UI/UX",
    name: "Error messages",
    description:
      "Errors are displayed clearly.",
    severity: "medium",
  }),

  createTest({
    id: "UI-009",
    category: "UI/UX",
    name: "Success messages",
    description:
      "Successful actions provide feedback.",
    severity: "low",
  }),

  createTest({
    id: "UI-010",
    category: "UI/UX",
    name: "Images load correctly",
    description:
      "Images load without broken resources.",
    severity: "medium",
  }),

  createTest({
    id: "UI-011",
    category: "UI/UX",
    name: "Broken links",
    description:
      "Links do not lead to broken destinations.",
    severity: "high",
  }),

  // =====================================================
  // PERFORMANCE
  // =====================================================

  createTest({
    id: "PERF-001",
    category: "Performance",
    name: "Page load time",
    description:
      "Pages load within an acceptable time.",
    severity: "high",
  }),

  createTest({
    id: "PERF-002",
    category: "Performance",
    name: "API response time",
    description:
      "API responses complete within an acceptable threshold.",
    severity: "high",
  }),

  createTest({
    id: "PERF-003",
    category: "Performance",
    name: "Large dataset performance",
    description:
      "Large datasets load efficiently.",
    severity: "medium",
  }),

  createTest({
    id: "PERF-004",
    category: "Performance",
    name: "Image optimization",
    description:
      "Images are reasonably optimized.",
    severity: "medium",
  }),

  createTest({
    id: "PERF-005",
    category: "Performance",
    name: "Unnecessary API calls",
    description:
      "The application avoids excessive duplicate requests.",
    severity: "medium",
  }),

  createTest({
    id: "PERF-006",
    category: "Performance",
    name: "Console errors",
    description:
      "No critical browser console errors occur.",
    severity: "high",
  }),

  createTest({
    id: "PERF-007",
    category: "Performance",
    name: "Slow network behavior",
    description:
      "The application handles slow connections correctly.",
    severity: "medium",
  }),
];

/*
|--------------------------------------------------------------------------
| CHECKLIST HELPERS
|--------------------------------------------------------------------------
*/

export function getTestsByCategory(
  category: string
): QATest[] {
  return QA_CHECKLIST.filter(
    (test) =>
      test.category === category
  );
}

export function getFailedTests(
  tests: QATest[]
): QATest[] {
  return tests.filter(
    (test) =>
      test.status === "failed"
  );
}

export function getCriticalFailures(
  tests: QATest[]
): QATest[] {
  return tests.filter(
    (test) =>
      test.status === "failed" &&
      test.severity === "critical"
  );
}

export function getPassedTests(
  tests: QATest[]
): QATest[] {
  return tests.filter(
    (test) =>
      test.status === "passed"
  );
}

export function getWarningTests(
  tests: QATest[]
): QATest[] {
  return tests.filter(
    (test) =>
      test.status === "warning"
  );
}

export function getSkippedTests(
  tests: QATest[]
): QATest[] {
  return tests.filter(
    (test) =>
      test.status === "skipped"
  );
}

export function getTestsByStatus(
  tests: QATest[],
  status: TestStatus
): QATest[] {
  return tests.filter(
    (test) =>
      test.status === status
  );
}

export function getTestsBySeverity(
  tests: QATest[],
  severity: TestSeverity
): QATest[] {
  return tests.filter(
    (test) =>
      test.severity === severity
  );
}

export function getChecklistCount(): number {
  return QA_CHECKLIST.length;
}

export function getCategoryCounts() {
  const categories: Record<
    string,
    number
  > = {};

  for (const test of QA_CHECKLIST) {
    categories[test.category] =
      (categories[test.category] || 0) + 1;
  }

  return categories;
}