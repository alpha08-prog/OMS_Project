import 'package:flutter/cupertino.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:anki_clone/widgets/oms_loader.dart';

/// [OmsLoader] falls back to a bare spinner when its box is too short for the
/// logo. On that path `build` never reads the animation, so the `late final`
/// controller stays uninitialised — and initialising it is what starts a
/// repeating ticker. Whether the loader leaves a ticker running after it is
/// removed decides whether every transient loading state permanently pins the
/// app at 60fps.
void main() {
  Widget host({required double side, required bool showLoader}) {
    return CupertinoApp(
      home: Center(
        child: SizedBox(
          width: side,
          height: side,
          child: showLoader ? const OmsLoader(size: 56) : const SizedBox(),
        ),
      ),
    );
  }

  testWidgets('leaves no ticker running after a full-size loader is removed',
      (WidgetTester tester) async {
    await tester.pumpWidget(host(side: 300, showLoader: true));
    await tester.pump(const Duration(milliseconds: 100));
    expect(SchedulerBinding.instance.transientCallbackCount, greaterThan(0),
        reason: 'the full loader should be animating while mounted');

    await tester.pumpWidget(host(side: 300, showLoader: false));
    await tester.pump(const Duration(milliseconds: 100));
    expect(SchedulerBinding.instance.transientCallbackCount, 0,
        reason: 'removing the loader must stop its animation');
  });

  testWidgets('leaves no ticker running after a short-box loader is removed',
      (WidgetTester tester) async {
    // 30x30 is the real case: the stat-card badge on Action History.
    await tester.pumpWidget(host(side: 30, showLoader: true));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.pumpWidget(host(side: 30, showLoader: false));
    await tester.pump(const Duration(milliseconds: 100));
    expect(SchedulerBinding.instance.transientCallbackCount, 0,
        reason: 'a loader that fell back to the bare spinner must not leave '
            'a repeating AnimationController running after disposal');
  });
}
