package com.itsa.crm.clients_service.util;

/**
 * Encodes and decodes public API identifiers with string prefixes.
 */
public final class IdCodec {
	private IdCodec() {}

	/**
	 * Encodes a numeric id with the provided prefix.
	 *
	 * @param prefix id prefix (e.g., "clt_")
	 * @param id numeric id
	 * @return encoded identifier
	 */
	public static String encode(String prefix, long id) {
		return prefix + id;
	}

	/**
	 * Decodes a prefixed identifier into a numeric id.
	 *
	 * @param prefix expected prefix
	 * @param value encoded identifier
	 * @return numeric id
	 * @throws IllegalArgumentException when the prefix is missing or invalid
	 */
	public static long decode(String prefix, String value) {
		if (value == null || !value.startsWith(prefix)) {
			throw new IllegalArgumentException("invalid id");
		}
		String suffix = value.substring(prefix.length());
		return Long.parseLong(suffix);
	}
}
