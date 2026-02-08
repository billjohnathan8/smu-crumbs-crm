package com.scroogebank.crm.agentservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

	private Jwt jwt = new Jwt();
	private RootAdmin rootAdmin = new RootAdmin();

	public Jwt getJwt() {
		return jwt;
	}

	public void setJwt(Jwt jwt) {
		this.jwt = jwt;
	}

	public RootAdmin getRootAdmin() {
		return rootAdmin;
	}

	public void setRootAdmin(RootAdmin rootAdmin) {
		this.rootAdmin = rootAdmin;
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

	public static class RootAdmin {
		private String email;
		private String password;

		public String getEmail() {
			return email;
		}

		public void setEmail(String email) {
			this.email = email;
		}

		public String getPassword() {
			return password;
		}

		public void setPassword(String password) {
			this.password = password;
		}
	}
}
