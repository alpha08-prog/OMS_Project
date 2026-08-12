import 'package:flutter/material.dart';
import '../services/task_service.dart';
import '../theme/app_theme.dart';

/// Bottom sheet that lets an admin forward a task to another staff member.
/// Fetches the active staff list, lets you pick a recipient + optional remark,
/// then calls PATCH /api/tasks/:id/forward. Returns `true` if forwarded.
Future<bool> showForwardTaskSheet(
  BuildContext context, {
  required String taskId,
  required String taskTitle,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _ForwardSheet(taskId: taskId, taskTitle: taskTitle),
  );
  return result ?? false;
}

class _ForwardSheet extends StatefulWidget {
  final String taskId;
  final String taskTitle;
  const _ForwardSheet({required this.taskId, required this.taskTitle});

  @override
  State<_ForwardSheet> createState() => _ForwardSheetState();
}

class _ForwardSheetState extends State<_ForwardSheet> {
  bool _loading = true;
  bool _submitting = false;
  List<Map<String, dynamic>> _staff = [];
  String? _recipientId;
  final _remarkCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadStaff();
  }

  @override
  void dispose() {
    _remarkCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStaff() async {
    final staff = await TaskService.getStaff();
    if (!mounted) return;
    setState(() {
      _staff = staff;
      _loading = false;
    });
  }

  Future<void> _submit() async {
    if (_recipientId == null) return;
    setState(() => _submitting = true);
    final res = await TaskService.forward(
      widget.taskId,
      recipientId: _recipientId!,
      remark: _remarkCtrl.text,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(res.message)));
    if (res.ok) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Forward Task',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(widget.taskTitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_staff.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: Text('No staff available')),
            )
          else ...[
            DropdownButtonFormField<String>(
              value: _recipientId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Forward to',
                border: OutlineInputBorder(),
              ),
              items: _staff
                  .map((s) => DropdownMenuItem(
                        value: s['id']?.toString(),
                        child: Text(s['name']?.toString() ?? '-'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _recipientId = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _remarkCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Remark (optional)',
                border: OutlineInputBorder(),
                hintText: 'Why are you forwarding this?',
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: AppTheme.primaryButton(),
                onPressed:
                    (_recipientId == null || _submitting) ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Forward',
                        style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
