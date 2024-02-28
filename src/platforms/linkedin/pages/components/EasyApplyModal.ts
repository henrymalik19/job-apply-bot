import { Locator, Page } from "playwright";

class EasyApplyModal {
  private readonly page: Page;
  private readonly self: Locator;

  readonly nextBtn: Locator;
  readonly reviewBtn: Locator;
  readonly submitBtn: Locator;
  readonly dismissBtn: Locator;
  readonly discardBtn: Locator;
  readonly continueApplyBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.self = page.locator(".jobs-easy-apply-content");

    this.nextBtn = this.self.getByLabel("Continue to next step");
    this.reviewBtn = this.page.getByLabel("Review your application");
    this.submitBtn = this.page.getByLabel("Submit application");
    this.dismissBtn = this.page.getByRole("button", {
      name: "Dismiss",
      exact: true,
    });
    this.discardBtn = this.page.locator(
      '[data-control-name="discard_application_confirm_btn"]',
    );
    this.continueApplyBtn = this.page.getByText("Continue applying");
  }

  async apply() {
    const btnContainer = await this.page.locator(
      ".jobs-apply-button--top-card",
    );
    if (!(await btnContainer.getByText("Easy Apply").isVisible()))
      throw new Error("Not an Easy Apply Job!");

    await this.page.waitForTimeout(2000);
    if (await this.continueApplyBtn.isVisible()) {
      await this.continueApplyBtn.click();
    }

    let loopCount = 0;
    while (true) {
      if (loopCount === 50) throw new Error("Unable to apply. Loop error");

      await this.answerTextFieldQuestions();
      await this.answerSelectQuestions();
      await this.answerRadioQuestions();

      await this.page.waitForTimeout(2000);
      if (await this.submitBtn.isVisible()) {
        await this.submitBtn.click();
        console.info("[info] submitting application...");
        break;
      }

      if (await this.reviewBtn.isVisible()) {
        await this.reviewBtn.click();
        break;
      }

      if (await this.nextBtn.isVisible()) {
        await this.nextBtn.click();
      }
      if (await this.hasErrors()) {
        console.info(
          "[info] unable to submit application -> missing information",
        );
        throw new Error("unable to submit application -> missing information");
      }

      loopCount++;
    }

    await this.page.waitForTimeout(2000);
    if (await this.reviewBtn.isVisible()) {
      await this.reviewBtn.click();
    }

    await this.page.waitForTimeout(2000);
    if (await this.submitBtn.isVisible()) {
      await this.submitBtn.click();
      console.info("[info] submitting application...");
    }

    await this.page.waitForTimeout(5000);
    if (await this.page.getByText("Application sent").isVisible()) {
      console.info("[info] application submitted successfully");
    }

    // close out of app to move on to next
    await this.page.waitForTimeout(2000);
    if (await this.dismissBtn.isVisible()) {
      await this.dismissBtn.click();
      console.info("[info] closing 'Easy Apply' modal...");
    }

    await this.page.waitForTimeout(2000);
    if (await this.discardBtn.isVisible()) {
      await this.discardBtn.click();
      console.info("[info] discarding application...");
    }
  }

  private async answerTextFieldQuestions() {
    try {
      console.info("[info] searching for empty text fields...");

      const txtFields = await this.self
        .locator('.jobs-easy-apply-form-section__grouping input[type="text"]')
        .all();

      const emptyTxtFields: Locator[] = [];
      for (const txtField of txtFields) {
        const value = await txtField.inputValue();
        if (!value) emptyTxtFields.push(txtField);
      }

      // console.debug(
      //   `[debug] ${txtFields.length} text field(s) found ${emptyTxtFields.length} text field(s) is/are empty`,
      // );

      for (const txtField of emptyTxtFields) {
        const labelTxt = await txtField.evaluate(
          (n: HTMLInputElement) =>
            (n.labels as NodeListOf<HTMLLabelElement>)[0].textContent,
        );

        await this.self.getByLabel(labelTxt as string).fill("10");
      }
    } catch (error) {
      console.error(
        "[error] unable to answer text field questions. continuing...",
      );
      throw new Error("unable to apply -> missing information");
    }
  }

  private async answerSelectQuestions() {
    try {
      console.info("[info] searching for empty select input questions...");

      const selectInputs = await this.self
        .locator(".jobs-easy-apply-form-section__grouping select")
        .all();

      const emptySelectInputs: Locator[] = [];
      for (const selectInput of selectInputs) {
        const value = (await selectInput.inputValue()).trim();

        if (value === "Select an option") {
          emptySelectInputs.push(selectInput);
        }
      }
      // console.debug(
      //   `[debug] ${selectInputs.length} select input(s) found ${emptySelectInputs.length} select input(s) is/are empty`,
      // );

      for (const selectInput of selectInputs) {
        const labelTxt = await selectInput.evaluate((n: HTMLSelectElement) =>
          (
            n.labels as NodeListOf<HTMLLabelElement>
          )[0].childNodes[1].textContent?.trim(),
        );

        const select = await this.self.getByLabel(labelTxt as string);

        if ((await select.inputValue()) === "Select an option") {
          await select.selectOption({ label: "Yes" });
        }
      }
    } catch (error) {
      console.error(
        "[error] unable to answer select input questions. continuing...",
      );
      throw new Error("unable to apply -> missing information");
    }
  }

  private async answerRadioQuestions() {
    try {
      console.info("[info] searching for empty radio button questions...");

      const fieldsets = await this.self
        .locator(".jobs-easy-apply-form-section__grouping fieldset")
        .all();

      const emptyFieldsets: Locator[] = [];
      for (const fieldset of fieldsets) {
        const labelTxt = await fieldset.locator("legend span"); //.textContent();

        // console.log(labelTxt);
        // if (value === "Select an option") {
        //   emptySelectInputs.push(selectInput);
        // }
      }
    } catch (error) {
      console.error("[error] unable to answer radio questions... continuing");
      throw new Error("unable to apply -> missing information");
    }
  }

  private async hasErrors() {
    const errors = await this.self
      .locator(".artdeco-inline-feedback--error")
      .all();

    if (errors.length !== 0) {
      console.info(
        `[info] ${errors.length} fields found with missing information`,
      );
    }
    return errors.length !== 0;
  }
}

export { EasyApplyModal };
