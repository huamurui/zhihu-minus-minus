import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { ActionIconCount } from '../src/components/ActionIconCount';

test('the count is centred under the icon by layout, not by a fixed offset', async () => {
  const host = await render(
    <ActionIconCount count={206}>
      <Text>icon</Text>
    </ActionIconCount>,
  );
  const count = host.getByTestId('action-icon-count');
  expect(count).toHaveTextContent('206');
  const countStyle = StyleSheet.flatten(count.props.style);
  expect(countStyle.position).toBeUndefined();
  expect(countStyle.textAlign).toBe('center');
  // Icon then count in one centred column, inside the unchanged 44×44 target.
  expect(StyleSheet.flatten(count.parent?.props.style)).toMatchObject({
    width: 44,
    height: 44,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  });
});

test('without a count only the icon shows', async () => {
  const host = await render(
    <ActionIconCount>
      <Text>icon</Text>
    </ActionIconCount>,
  );
  expect(host.queryByTestId('action-icon-count')).toBeNull();
});
