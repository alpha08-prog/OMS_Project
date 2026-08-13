// Mounts the Material-only pages that the iOS nav menu can reach inside the
// exact shell main.dart builds for iOS (a bare CupertinoApp) and asserts they
// render without throwing. Reproduces the App Review "app is not stable" class
// of failure: Material widgets have no MaterialLocalizations/ScaffoldMessenger
// ancestor under CupertinoApp.
import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:anki_clone/main.dart'
    show kCupertinoShellLocalizations, cupertinoShellBuilder;
import 'package:anki_clone/screens/tasks/all_tasks_page.dart';
import 'package:anki_clone/screens/tasks/forwarded_tasks_page.dart';
import 'package:anki_clone/screens/meetings/meetings_page.dart';
import 'package:anki_clone/screens/admin/activity_log_page.dart';
import 'package:anki_clone/screens/visitors/people_add_page.dart';

void main() {
  final pages = <String, Widget Function()>{
    'AllTasksPage': () => const AllTasksPage(role: 'STAFF'),
    'ForwardedTasksPage': () => const ForwardedTasksPage(),
    'MeetingsPage': () => const MeetingsPage(),
    'ActivityLogPage': () => const ActivityLogPage(),
    'PeopleAddPage': () => const PeopleAddPage(),
  };

  pages.forEach((name, builder) {
    testWidgets('$name renders inside the iOS CupertinoApp shell',
        (tester) async {
      await tester.pumpWidget(
        CupertinoApp(
          // Exactly the shell main.dart builds for iOS.
          localizationsDelegates: kCupertinoShellLocalizations,
          builder: cupertinoShellBuilder,
          home: Builder(
            builder: (context) => CupertinoButton(
              child: const Text('go'),
              onPressed: () => Navigator.push(
                context,
                CupertinoPageRoute(builder: (_) => builder()),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull, reason: '$name threw on iOS');
    });
  });
}
