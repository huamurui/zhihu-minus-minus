package expo.modules.crypto.aes.objects

import java.nio.ByteBuffer

/**
 * JVM adapter for the IV || ciphertext || tag layout used by Expo SealedData.
 * Only the Expo bridge/shared-object machinery is replaced; the test compiles
 * the installed, production CipherExtensions.kt encryption/decryption functions.
 */
class SealedData(val ivBytes: ByteArray, ciphertextLength: Int, tagLength: Int) {
  private val content = ByteArray(ivBytes.size + ciphertextLength + tagLength).also {
    ivBytes.copyInto(it)
  }

  val taggedCiphertextBuffer: ByteBuffer
    get() = ByteBuffer.wrap(content, ivBytes.size, content.size - ivBytes.size)

  fun corruptCiphertext() {
    content[ivBytes.size] = (content[ivBytes.size].toInt() xor 1).toByte()
  }
}
