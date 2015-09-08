(function(app){
    var d = new Date();
    var $startInput = $('#datetime-range-start');
    var $finishInput = $('#datetime-range-finish');
    var finishVal = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() + " 12:00 am";
    d.setDate(d.getDate() - 7);
    var startVal = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() + " 12:00 am";
    $startInput.val(startVal);
    $finishInput.val(finishVal);

    // Attach a change event to end time

    $finishInput.appendDtpicker({
        minDate: startVal,
    });
    $finishInput.change(function() {
        $startInput.appendDtpicker({
            maxDate: $finishInput.val(), // when the end time changes, update the maxDate on the start field
        });
    });

    $startInput.appendDtpicker({
        maxDate: finishVal,
    });
    $startInput.change(function() {
        $finishInput.appendDtpicker({
            minDate: $startInput.val(), // when the start time changes, update the minDate on the end field
        });
    });

    app.dateTimePicker = {
      onChange: function (callback) {
        $startInput.add($finishInput).change(function () {
          callback.call(this, {
            start: $startInput.val(),
            finish: $finishInput.val(),
          });
        });
      },
    };
})(app || (app = {}));

