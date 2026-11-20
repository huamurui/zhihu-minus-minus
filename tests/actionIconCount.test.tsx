import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { ActionIconCount } from '../src/components/ActionIconCount';

test('the count sits beside the icon instead of over its corner', async () => {
  const host = await render(
    <ActionIconCount count={206}>
      <Text>icon</Text>
    </ActionIconCount>,
  );
  const count = host.getByTestId('action-icon-count');
  expect(count).toHaveTextContent('206');
  expect(StyleSheet.flatten(count.props.style).position).toBeUndefined();
  const row = StyleSheet.flatten(count.parent?.props.style);
  expect(row).toMatchObject({ flexDirection: 'row', minWidth: 44 });
});

test('without a count only the icon shows', async () => {
  const host = await render(
    <ActionIconCount>
      <Text>icon</Text>
    </ActionIconCount>,
  );
  expect(host.queryByTestId('action-icon-count')).toBeNull();
});
