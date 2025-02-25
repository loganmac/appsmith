import {
  agHelper,
  appSettings,
  deployMode,
  homePage,
  assertHelper,
  locators,
} from "../../../../support/Objects/ObjectsCore";

describe("Test Sidebar navigation style", function () {
  before(() => {
    // Import an application
    homePage.NavigateToHome();
    homePage.ImportApp("appNavigationTestingAppWithLongPageNamesAndTitle.json");
    assertHelper
      .WaitForNetworkCall("@importNewApplication")
      .then((interception) => {
        agHelper.Sleep();
        const { isPartialImport } = interception.response.body.data;
        if (isPartialImport) {
          homePage.AssertNCloseImport();
        } else {
          homePage.AssertImportToast();
        }
      });
  });

  it("1. Change 'Orientation' to 'Side', sidebar should appear", () => {
    agHelper.GetNClick(appSettings.locators._appSettings);
    agHelper.GetNClick(appSettings.locators._navigationSettingsTab);
    agHelper.GetNClick(
      appSettings.locators._navigationSettings._orientationOptions._side,
      0,
      true,
    );
    deployMode.DeployApp();
    agHelper.AssertElementVisible(appSettings.locators._sideNavbar);
    agHelper.AssertElementAbsence(appSettings.locators._topStacked);
    agHelper.AssertElementAbsence(appSettings.locators._topInline);
    //Page change should work
    const pageName = "Page5 - with long long name";
    agHelper.GetNClickByContains(
      appSettings.locators._navigationMenuItem,
      pageName,
      0,
      true,
    );
    agHelper.AssertElementVisible(
      appSettings.locators._getActivePage(pageName),
    );
  });

  it("2. Sidebar background should be default to white, and should change when background color is set to theme", () => {
    // The background of sidebar should be white since light color style is default
    agHelper.AssertCSS(
      appSettings.locators._sideNavbar,
      "background-color",
      "rgb(255, 255, 255)",
      0,
    );
    // Changing color style to theme should change navigation's background color
    deployMode.NavigateBacktoEditor();
    agHelper.GetNClick(appSettings.locators._appSettings);
    agHelper.GetNClick(appSettings.locators._navigationSettingsTab);
    agHelper.GetNClick(appSettings.locators._colorStyleOptions._theme, 0, true);
    deployMode.DeployApp();
    agHelper.AssertCSS(
      appSettings.locators._sideNavbar,
      "background-color",
      "rgb(85, 61, 233)",
      0,
    );
    //Application name, share button, edit button, and user dropdown should be available in the app sidebar
    agHelper.AssertElementVisible(appSettings.locators._applicationName);
    agHelper.AssertElementVisible(appSettings.locators._shareButton);
    agHelper.AssertElementVisible(locators._backToEditor);
    agHelper.AssertElementVisible(homePage._profileMenu);
  });

  it("3. Share button should open the share modal, edit button should take us back to the editor, and clicking on user profile button should open up the dropdown menu", () => {
    // Share
    agHelper.GetNClick(
      `${appSettings.locators._sideNavbar} ${appSettings.locators._shareButton}`,
    );
    agHelper.Sleep(1000);
    agHelper.AssertElementVisible(appSettings.locators._modal);
    agHelper.GetNClick(appSettings.locators._modalClose, 0, true);
    // User profile dropdown
    agHelper.GetNClick(homePage._profileMenu);
    agHelper.AssertElementVisible(
      appSettings.locators._userProfileDropdownMenu,
    );
  });
});
