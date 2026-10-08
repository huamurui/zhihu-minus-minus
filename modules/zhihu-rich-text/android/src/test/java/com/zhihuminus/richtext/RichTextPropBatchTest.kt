package com.zhihuminus.richtext

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichTextPropBatchTest {
  private val initial = RichTextViewProps("flow-a", "config-a", 320, "layout-a", false)
  private val initialUpdates: List<(RichTextViewProps) -> RichTextViewProps> = listOf(
    { it.copy(flowJson = initial.flowJson) },
    { it.copy(configJson = initial.configJson) },
    { it.copy(contentWidthPx = initial.contentWidthPx) },
    { it.copy(layoutKey = initial.layoutKey) },
    { it.copy(selectable = initial.selectable) }
  )

  private fun <T> permutations(items: List<T>): List<List<T>> =
    if (items.isEmpty()) listOf(emptyList()) else items.indices.flatMap { index ->
      permutations(items.filterIndexed { other, _ -> other != index }).map { listOf(items[index]) + it }
    }

  @Test fun firstMountPublishesOneCompleteSnapshotForEverySetterOrder() {
    for (updates in permutations(initialUpdates)) {
      val batch = RichTextPropBatch()
      for (update in updates) {
        batch.update(update)
        // No consumer sees a new flow with the previous font, width or identity.
        assertEquals(RichTextViewProps(), batch.current)
      }
      val change = batch.commit()!!
      assertEquals(initial, change.current)
      assertTrue(change.requiresRebuild)
      assertEquals(1, batch.revision)
      assertNull(batch.commit())
    }
  }

  @Test fun unchangedPropsAndChangesRevertedWithinABatchDoNotRebuild() {
    val batch = RichTextPropBatch()
    batch.update { initial }
    batch.commit()
    val revision = batch.revision
    batch.update { it.copy(contentWidthPx = 480) }
    batch.update { it.copy(contentWidthPx = initial.contentWidthPx) }
    for (update in initialUpdates) batch.update(update)
    assertNull(batch.commit())
    assertEquals(revision, batch.revision)
    assertTrue(batch.accepts(revision))
  }

  @Test fun identityAndSelectionChangesCommitWithoutRebuildingText() {
    val batch = RichTextPropBatch()
    batch.update { initial }
    batch.commit()
    batch.update { it.copy(layoutKey = "layout-b", selectable = true) }
    val change = batch.commit()!!
    assertFalse(change.requiresRebuild)
    assertEquals(initial.flowJson, change.current.flowJson)
    assertEquals("layout-b", change.current.layoutKey)
    assertTrue(change.current.selectable)
  }

  @Test fun eachGeometryInputIndependentlyInvalidatesTheCommittedText() {
    val updates: List<(RichTextViewProps) -> RichTextViewProps> = listOf(
      { it.copy(flowJson = "flow-b") },
      { it.copy(configJson = "config-b") },
      { it.copy(contentWidthPx = 480) }
    )
    for (update in updates) {
      val batch = RichTextPropBatch()
      batch.update { initial }
      batch.commit()
      batch.update(update)
      assertTrue(batch.commit()!!.requiresRebuild)
    }
  }

  @Test fun pendingAndSupersededBatchesRejectOldMeasurementsEvenWhenTheKeyReturns() {
    val batch = RichTextPropBatch()
    batch.update { initial }
    batch.commit()
    val oldRevision = batch.revision
    batch.update { it.copy(layoutKey = "layout-b") }
    assertFalse(batch.accepts(oldRevision))
    batch.commit()
    batch.update { it.copy(layoutKey = initial.layoutKey) }
    batch.commit()
    assertEquals(initial.layoutKey, batch.current.layoutKey)
    assertFalse(batch.accepts(oldRevision))
    assertTrue(batch.accepts(batch.revision))
  }
}
