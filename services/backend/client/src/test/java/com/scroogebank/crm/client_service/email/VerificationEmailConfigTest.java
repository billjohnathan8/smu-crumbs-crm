package com.scroogebank.crm.client_service.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.scroogebank.crm.client_service.config.AppProperties;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.sesv2.SesV2Client;

class VerificationEmailConfigTest {

	@Test
	void sesV2Client_withRegionAndEndpoint_buildsClient() {
		VerificationEmailConfig config = new VerificationEmailConfig();
		AppProperties appProperties = new AppProperties();
		appProperties.getVerificationEmail().setAwsRegion("ap-southeast-1");
		appProperties.getVerificationEmail().setAwsEndpointUrl("http://localhost:4566");

		SesV2Client client = config.sesV2Client(appProperties);

		assertThat(client).isNotNull();
		client.close();
	}

	@Test
	void sesV2Client_withBlankRegionAndEndpoint_buildsClient() {
		VerificationEmailConfig config = new VerificationEmailConfig();
		AppProperties appProperties = new AppProperties();
		appProperties.getVerificationEmail().setAwsRegion(" ");
		appProperties.getVerificationEmail().setAwsEndpointUrl(" ");

		SesV2Client client = config.sesV2Client(appProperties);

		assertThat(client).isNotNull();
		client.close();
	}

	@Test
	void sesVerificationEmailSender_returnsSenderInstance() {
		VerificationEmailConfig config = new VerificationEmailConfig();
		SesV2Client client = mock(SesV2Client.class);
		AppProperties appProperties = new AppProperties();

		SesVerificationEmailSender sender = config.sesVerificationEmailSender(client, appProperties);

		assertThat(sender).isNotNull();
	}
}
