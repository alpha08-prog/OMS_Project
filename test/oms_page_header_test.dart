// OmsPageHeader sits inside an unbounded-height Column on every Cupertino
// screen, and is used both as a pushed route and as a bottom-tab root. These
// tests pin the two properties that broke in review: it must lay out under
// unbounded height, and its title must be centred against the full bar width
// regardless of how wide the trailing action group is.
import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:anki_clone/widgets/cupertino/cupertino_page_header.dart';
import 'package:anki_clone/widgets/oms_app_bar.dart';
import 'package:flutter/material.dart'
    show AppBar, BoxDecoration, Container, MaterialApp, Scaffold;

Widget _host(Widget header, {bool pushed = false}) {
  final page = CupertinoPageScaffold(
    child: Column(children: [header, const Expanded(child: SizedBox())]),
  );
  if (!pushed) return CupertinoApp(home: page);
  return CupertinoApp(
    home: Builder(
      builder: (context) => CupertinoButton(
        child: const Text('go'),
        onPressed: () => Navigator.push(
          context,
          CupertinoPageRoute(builder: (_) => page),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('lays out inside an unbounded-height Column', (tester) async {
    await tester.pumpWidget(_host(
      OmsPageHeader(
        title: 'Old Grievances',
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(
            4,
            (_) => const SizedBox(width: 44, height: 44),
          ),
        ),
      ),
    ));
    expect(tester.takeException(), isNull);
  });

  testWidgets('title stays centred despite a wide trailing group',
      (tester) async {
    await tester.pumpWidget(_host(
      OmsPageHeader(
        title: 'Events',
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(
            3,
            (_) => const SizedBox(width: 44, height: 44),
          ),
        ),
      ),
    ));
    final screenCentre = tester.getSize(find.byType(CupertinoApp)).width / 2;
    final titleCentre = tester.getCenter(find.text('Events')).dx;
    expect((titleCentre - screenCentre).abs(), lessThan(1.0));
  });

  // A pushed screen whose header hides the back chevron AND supplies no custom
  // leading widget leaves the edge-swipe gesture as the only way out. Eleven
  // screens shipped that way. This scans the source so a new one cannot sneak
  // back in.
  test('no OmsPageHeader hides back without providing a leading control', () {
    final offenders = <String>[];
    final headerCall = RegExp(r'OmsPageHeader\s*\(');

    for (final file in Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))) {
      if (file.path.endsWith('cupertino_page_header.dart')) continue;
      final src = file.readAsStringSync();
      for (final m in headerCall.allMatches(src)) {
        // Walk to the matching close paren to get this call's own arguments.
        var depth = 0;
        var i = m.end - 1;
        final start = i + 1;
        var end = -1;
        while (i < src.length) {
          final c = src[i];
          if ('([{'.contains(c)) {
            depth++;
          } else if (')]}'.contains(c)) {
            depth--;
            if (depth == 0) {
              end = i;
              break;
            }
          }
          i++;
        }
        if (end == -1) continue;
        final args = src.substring(start, end);
        final hidesBack = RegExp(r'showBack\s*:\s*false').hasMatch(args);
        final hasLeading = RegExp(r'\bleading\s*:').hasMatch(args);
        if (hidesBack && !hasLeading) {
          final line = '\n'.allMatches(src.substring(0, m.start)).length + 1;
          offenders.add('${file.path}:$line');
        }
      }
    }

    expect(offenders, isEmpty,
        reason: 'These headers offer no way back:\n${offenders.join('\n')}');
  });

  testWidgets('no back chevron when it is a tab root, one when pushed',
      (tester) async {
    await tester.pumpWidget(_host(const OmsPageHeader(title: 'Menu')));
    expect(find.byIcon(CupertinoIcons.chevron_left), findsNothing);

    await tester.pumpWidget(_host(const OmsPageHeader(title: 'Menu'),
        pushed: true));
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.byIcon(CupertinoIcons.chevron_left), findsOneWidget);
  });

  // omsAppBar paints its purple gradient through `flexibleSpace`. A childless
  // DecoratedBox there collapses to zero size, which rendered the bar white
  // with white text on it — invisible. Pin that it fills the bar.
  testWidgets('omsAppBar paints a gradient behind the title', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          appBar: omsAppBar(context, title: 'Meetings'),
          body: const SizedBox(),
        ),
      ),
    ));

    final gradientBox = find.descendant(
      of: find.byType(AppBar),
      matching: find.byWidgetPredicate((w) =>
          w is Container &&
          w.decoration is BoxDecoration &&
          (w.decoration as BoxDecoration).gradient != null),
    );
    expect(gradientBox, findsOneWidget);
    // A collapsed DecoratedBox/Container would be zero-sized.
    expect(tester.getSize(gradientBox).height, greaterThan(20));
    expect(tester.getSize(gradientBox).width, greaterThan(200));
  });
}
