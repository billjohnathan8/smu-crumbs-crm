package com.itsa.crm.clients_service.logging;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class LogServiceClientConfig {
	@Bean
	RestClient logServiceRestClient(@Value("${app.log-service-url}") String logServiceUrl) {
		return RestClient.builder().baseUrl(logServiceUrl).build();
	}
}
