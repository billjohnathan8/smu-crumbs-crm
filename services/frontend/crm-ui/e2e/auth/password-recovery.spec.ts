import { test, expect } from "@playwright/test";
import { gotoWithNetworkRetry } from "../helpers/auth";

test.describe("Password Recovery (Mocked)", () => {
  test("submits forgot password form and returns to login", async ({ page, context }) => {
    await context.clearCookies();
    let requestedEmail = "";

    await page.route("**/api/auth/forgot-password", async route => {
      const body = route.request().postDataJSON() as { email?: string };
      requestedEmail = body.email ?? "";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoWithNetworkRetry(page, "/forgot-password");
    await page.getByTestId("email-input").fill("user.recovery@example.com");
    await page.getByTestId("forgot-password-submit-button").click();

    await expect(page.getByRole("heading", { name: "Check Your Email" })).toBeVisible();
    expect(requestedEmail).toBe("user.recovery@example.com");

    await page.getByRole("button", { name: "Back to Login" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("resets password with token and returns to login", async ({ page, context }) => {
    await context.clearCookies();
    let requestBody: { token?: string; newPassword?: string; confirmPassword?: string } = {};

    await page.route("**/api/auth/reset-password", async route => {
      requestBody = route.request().postDataJSON() as {
        token?: string;
        newPassword?: string;
        confirmPassword?: string;
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoWithNetworkRetry(page, "/reset-password?token=mock-reset-token-123");
    await page.getByTestId("new-password-input").fill("NewPassword123!");
    await page.getByTestId("confirm-password-input").fill("NewPassword123!");
    await page.getByTestId("reset-password-submit-button").click();

    await expect(
      page.getByRole("heading", { name: "Password Reset Successful" }),
    ).toBeVisible();
    expect(requestBody.token).toBe("mock-reset-token-123");
    expect(requestBody.newPassword).toBe("NewPassword123!");
    expect(requestBody.confirmPassword).toBe("NewPassword123!");

    await page.getByRole("button", { name: "Go to Login" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
