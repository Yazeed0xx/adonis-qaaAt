import { test } from '@japa/runner'
import { escapeHtml } from '#lib/escape_html'

test.group('HTML escaping', () => {
  test('escapes every character that can create HTML markup', ({ assert }) => {
    assert.equal(
      escapeHtml(`<a href="x">Tom & Jerry's</a>`),
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#039;s&lt;/a&gt;'
    )
  })
})
