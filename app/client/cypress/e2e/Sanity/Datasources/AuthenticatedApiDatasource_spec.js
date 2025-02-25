const apiwidget = require("../../../locators/apiWidgetslocator.json");
const datasourceFormData = require("../../../fixtures/datasources.json");
const datasourceEditor = require("../../../locators/DatasourcesEditor.json");
const testdata = require("../../../fixtures/testdata.json");

import { agHelper, dataSources } from "../../../support/Objects/ObjectsCore";

describe("Authenticated API Datasource", function () {
  const URL = datasourceFormData["authenticatedApiUrl"];
  const headers = "Headers";
  const queryParams = "Query Params";
  const dsName = "FakeAuthenticatedApi";

  it("1. Bug: 12045 - No Blank screen diplay after New Authentication API datasource creation", function () {
    cy.NavigateToAPI_Panel();
    cy.get(apiwidget.createAuthApiDatasource).click();
    cy.renameDatasource(dsName);
    cy.fillAuthenticatedAPIForm();
    cy.saveDatasource();
    cy.contains(URL);
  });

  it("2. Bug: 12045 - No Blank screen diplay after editing/opening existing Authentication API datasource", function () {
    cy.get(".t--edit-datasource").click();
    cy.get(datasourceEditor.url).type("/users");
    cy.get(".t--save-datasource").click({ force: true });
    cy.contains(URL + "/users");
    agHelper.WaitUntilAllToastsDisappear();
    dataSources.DeleteDatasouceFromActiveTab(dsName);
  });

  it("3. Bug: 14181 -Make sure the datasource view mode page does not contain labels with no value.", function () {
    cy.NavigateToAPI_Panel();
    cy.get(apiwidget.createAuthApiDatasource).click();
    cy.renameDatasource("FakeAuthenticatedApi");
    cy.fillAuthenticatedAPIForm();
    cy.saveDatasource();
    cy.contains(headers).should("not.exist");
    cy.contains(queryParams).should("not.exist");
    agHelper.WaitUntilAllToastsDisappear();
    dataSources.DeleteDatasouceFromActiveTab(dsName);
  });

  //skipping this test as it is failing in pipeline - "authorizationURL": "https://oauth.mocklab.io/oauth/authorize",
  it.skip("4. Bug: 18051 - Save and Authorise should return to datasource page in view mode and not new datasource page", () => {
    cy.NavigateToAPI_Panel();
    cy.get(apiwidget.createAuthApiDatasource).click();
    cy.generateUUID().then((uuid) => {
      cy.renameDatasource(uuid);
      cy.fillAuthenticatedAPIForm();
      dataSources.AddOAuth2AuthorizationCodeDetails(
        testdata.accessTokenUrl,
        testdata.clientID,
        testdata.clientSecret,
        testdata.authorizationURL,
      );
      dataSources.AuthAPISaveAndAuthorize();
      cy.xpath('//input[@name="email"]').type("Test@email.com");
      cy.xpath('//input[@name="email"]').type("Test");
      cy.xpath("//input[@name='password']").type("Test@123");
      cy.xpath("//input[@id='login-submit']").click();
      cy.wait(2000);
      cy.reload();
      cy.get(".t--edit-datasource").should("be.visible");
      dataSources.DeleteDatasouceFromActiveTab(uuid);
    });
  });
});
