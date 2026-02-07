package com.itsa.crm.client_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

	private String logServiceUrl;
	private Jwt jwt = new Jwt();

	public String getLogServiceUrl() {
		return logServiceUrl;
	}

	public void setLogServiceUrl(String logServiceUrl) {
		this.logServiceUrl = logServiceUrl;
	}

	public Jwt getJwt() {
		return jwt;
	}

	public void setJwt(Jwt jwt) {
		this.jwt = jwt;
	}

	public static class Jwt {
		private String hmacSecret;

		public String getHmacSecret() {
			return hmacSecret;
		}

		public void setHmacSecret(String hmacSecret) {
			this.hmacSecret = hmacSecret;
		}
	}
}
