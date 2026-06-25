class Api::V1::AttendantSessionsController < Api::V1::BaseController
  def start
    session = AttendantSessionService.new(user: current_user).start_work

    success_response(
      data: {
        session_id: session.id,
        user_id: current_user.id,
        status: session.status,
        started_at: session.started_at,
        availability: current_user.availability
      },
      message: 'Work session started successfully'
    )
  rescue ActiveRecord::RecordInvalid => e
    error_response(
      ApiErrorCodes::VALIDATION_ERROR,
      e.message,
      status: :unprocessable_entity
    )
  end

  def stop
    session = AttendantSessionService.new(user: current_user).stop_work

    if session
      success_response(
        data: {
          session_id: session.id,
          user_id: current_user.id,
          status: session.status,
          started_at: session.started_at,
          ended_at: session.ended_at,
          availability: current_user.availability
        },
        message: 'Work session ended successfully'
      )
    else
      error_response(
        ApiErrorCodes::RESOURCE_NOT_FOUND,
        'No active work session found',
        status: :not_found
      )
    end
  end

  def status
    service = AttendantSessionService.new(user: current_user)
    active_session = service.active_session

    success_response(
      data: {
        user_id: current_user.id,
        is_working: service.working?,
        availability: current_user.availability,
        session: active_session ? {
          id: active_session.id,
          status: active_session.status,
          started_at: active_session.started_at,
          ended_at: active_session.ended_at
        } : nil
      },
      message: 'Work status retrieved successfully'
    )
  end

  def active
    summary = AttendantSessionService.active_attendants_summary

    success_response(
      data: {
        total: summary.size,
        attendants: summary
      },
      message: 'Active attendants retrieved successfully'
    )
  end
end
