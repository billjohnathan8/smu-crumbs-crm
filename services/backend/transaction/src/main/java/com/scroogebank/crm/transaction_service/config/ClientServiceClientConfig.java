package com.scroogebank.crm.transaction_service.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Configures the RestClient used to call the client-service.
 */
@Configuration
public class ClientServiceClientConfig {
	/**
	 * Builds a RestClient preconfigured with the client-service base URL.
	 */
	@Bean
	RestClient clientServiceRestClient(@Value("${app.client-service-url}") String baseUrl) {
		HttpClient httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(5))
			.build();
		JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
		requestFactory.setReadTimeout(Duration.ofSeconds(5));

		return RestClient.builder()
			.requestFactory(requestFactory)
			.baseUrl(baseUrl)
			.build();
	}
}
