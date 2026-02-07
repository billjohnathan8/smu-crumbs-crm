package com.itsa.crm.transaction_service.util;

/**
 * Encodes and decodes external ids with fixed prefixes.
 */
public final class IdCodec {
	private IdCodec() {}

	/**
	 * Formats an external id with the provided prefix.
	 */
	public static String encode(String prefix, long id) {
		return prefix + id;
	}

	/**
	 * Parses an external id, enforcing the expected prefix.
	 */
	public static long decode(String prefix, String value) {
		if (value == null || !value.startsWith(prefix)) {
			throw new IllegalArgumentException("invalid id");
		}
		String suffix = value.substring(prefix.length());
		return Long.parseLong(suffix);
	}
}



