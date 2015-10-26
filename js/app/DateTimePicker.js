(function(app){
    var d = new Date();
    var $startInput = $('#datetime-range-start');
    var $finishInput = $('#datetime-range-finish');
    var finishVal = _getDateString(d);
    d.setDate(d.getDate() - 7);
    var startVal = _getDateString(d);
    $startInput.val(startVal);
    $finishInput.val(finishVal);

    var baseDateTimePickerParams = {
      "locale": "ru",
      "calendarMouseScroll": false,
    };

    // Attach a change event to end time

    $finishInput.appendDtpicker($.extend(baseDateTimePickerParams, {
        minDate: startVal,
    }));
    $finishInput.change(function() {
        $startInput.appendDtpicker($.extend(baseDateTimePickerParams, {
            maxDate: $finishInput.val(), // when the end time changes, update the maxDate on the start field
        }));
    });

    $startInput.appendDtpicker($.extend(baseDateTimePickerParams, {
        maxDate: finishVal,
    }));
    $startInput.change(function() {
        $finishInput.appendDtpicker($.extend(baseDateTimePickerParams, {
            minDate: $startInput.val(), // when the start time changes, update the minDate on the end field
        }));
    });

    app.dateTimePicker = {
      startData: {
          startDate: startVal,
          finishDate: finishVal,
      },
      onChange: function (callback) {
        $startInput.add($finishInput).change(function () {
          callback.call(this, {
            start: $startInput.val(),
            finish: $finishInput.val(),
          });
        });
      },
    };

    function _getDateString(date) {
      var month = date.getMonth() + 1;
      return (date.getDate() < 10 ? '0' : '') +
        date.getDate() +
        '.' +
        (month < 10 ? '0' : '') +
        month +
        '.' +
        date.getFullYear() +
        " 12:00";
    }
})(app || (app = {}));

